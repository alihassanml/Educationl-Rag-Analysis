import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import BadRequestError, ForbiddenError, NotFoundError
from app.models.classroom import ClassMember
from app.models.notification import TYPE_PEER_CHALLENGE, TYPE_PEER_RESULT
from app.models.peer_match import (
    STATUS_ACCEPTED,
    STATUS_CANCELLED,
    STATUS_COMPLETED,
    STATUS_DECLINED,
    STATUS_EXPIRED,
    STATUS_PENDING,
    PeerBlock,
    PeerChallenge,
)
from app.models.quiz import Quiz, Topic, TopicProgress
from app.models.user import User
from app.schemas.peer_match import ChallengeDetail, PeerMatchCandidate
from app.schemas.quizzes import GenerateQuizRequest
from app.services import notification_service, quiz_service, recommendation_service
from app.services.embedding_service import Embedder
from app.services.groq_service import GroqService

logger = logging.getLogger("app.peer_match")
KIND_PEER_DUEL = quiz_service.KIND_PEER_DUEL


def find_matches(db: Session, user: User) -> list[PeerMatchCandidate]:
    """Find other opted-in students who have weak topics (needs_revision) matching
    the current student's weak topics. Candidates in the same class are listed first."""
    if not user.peer_match_opt_in:
        return []

    # 1. Get current student's weak topics
    my_progress_rows = db.scalars(
        select(TopicProgress)
        .options(selectinload(TopicProgress.topic))
        .where(TopicProgress.user_id == user.id)
    ).all()

    my_weak_topics: dict[str, Topic] = {}
    for p in my_progress_rows:
        if not p.topic:
            continue
        status = recommendation_service.classify(p.correct_count, p.attempt_count)
        if status == recommendation_service.NEEDS_REVISION:
            my_weak_topics[p.topic.name.strip().lower()] = p.topic

    if not my_weak_topics:
        return []

    # 2. Blocked user IDs (either direction)
    blocked_ids = set(
        db.scalars(select(PeerBlock.blocked_user_id).where(PeerBlock.user_id == user.id)).all()
    ) | set(db.scalars(select(PeerBlock.user_id).where(PeerBlock.blocked_user_id == user.id)).all())

    # 3. Find other opted-in students
    other_users = db.scalars(
        select(User).where(
            User.id != user.id,
            User.peer_match_opt_in.is_(True),
            ~User.id.in_(blocked_ids) if blocked_ids else True,
        )
    ).all()
    if not other_users:
        return []

    other_user_ids = [u.id for u in other_users]
    user_map = {u.id: u for u in other_users}

    # 4. Same class IDs
    my_class_ids = set(
        db.scalars(select(ClassMember.class_id).where(ClassMember.student_id == user.id)).all()
    )
    same_class_student_ids: set[uuid.UUID] = set()
    if my_class_ids:
        same_class_student_ids = set(
            db.scalars(
                select(ClassMember.student_id).where(
                    ClassMember.class_id.in_(my_class_ids),
                    ClassMember.student_id.in_(other_user_ids),
                )
            ).all()
        )

    # 5. Get other users' progress on topics matching our weak topics
    other_progress = db.scalars(
        select(TopicProgress)
        .options(selectinload(TopicProgress.topic))
        .where(TopicProgress.user_id.in_(other_user_ids))
    ).all()

    candidates: list[PeerMatchCandidate] = []
    seen: set[tuple[uuid.UUID, str]] = set()

    for p in other_progress:
        if not p.topic:
            continue
        status = recommendation_service.classify(p.correct_count, p.attempt_count)
        if status != recommendation_service.NEEDS_REVISION:
            continue
        tname_norm = p.topic.name.strip().lower()
        if tname_norm in my_weak_topics:
            key = (p.user_id, tname_norm)
            if key in seen:
                continue
            seen.add(key)
            peer = user_map[p.user_id]
            matched_display_name = my_weak_topics[tname_norm].name
            candidates.append(
                PeerMatchCandidate(
                    user_id=peer.id,
                    display_name=peer.display_name or "Anonymous Student",
                    topic_name=matched_display_name,
                    in_same_class=peer.id in same_class_student_ids,
                )
            )

    # Sort same-class first, then display name
    candidates.sort(key=lambda c: (not c.in_same_class, c.display_name.lower()))
    return candidates


def _expire_stale_challenges(db: Session, challenges: list[PeerChallenge]) -> None:
    now = datetime.now(UTC)
    for c in challenges:
        if c.status == STATUS_PENDING and c.expires_at < now:
            c.status = STATUS_EXPIRED
    db.flush()


def create_challenge(
    db: Session,
    challenger: User,
    opponent_id: uuid.UUID,
    topic_name: str,
    difficulty: str | None = None,
) -> PeerChallenge:
    if not challenger.peer_match_opt_in:
        raise BadRequestError("You must enable Peer Match in Settings to send challenges")
    if challenger.id == opponent_id:
        raise BadRequestError("You cannot challenge yourself")

    opponent = db.scalar(select(User).where(User.id == opponent_id))
    if not opponent or not opponent.peer_match_opt_in:
        raise BadRequestError("This student is not available for Peer Match")

    # Check blocked
    is_blocked = db.scalar(
        select(PeerBlock).where(
            or_(
                and_(PeerBlock.user_id == challenger.id, PeerBlock.blocked_user_id == opponent_id),
                and_(PeerBlock.user_id == opponent_id, PeerBlock.blocked_user_id == challenger.id),
            )
        )
    )
    if is_blocked:
        raise BadRequestError("Cannot challenge this student")

    settings = get_settings()

    # Rate limit: max pending
    active_pending = (
        db.scalar(
            select(func.count(PeerChallenge.id)).where(
                PeerChallenge.challenger_id == challenger.id,
                PeerChallenge.status == STATUS_PENDING,
            )
        )
        or 0
    )
    if active_pending >= settings.peer_challenge_max_pending:
        raise BadRequestError(
            f"You already have {active_pending} pending challenges. "
            "Wait for them to complete or expire."
        )

    diff = difficulty or "intermediate"
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.peer_challenge_expiry_minutes)

    challenge = PeerChallenge(
        challenger_id=challenger.id,
        opponent_id=opponent.id,
        topic_name=topic_name.strip(),
        difficulty=diff,
        status=STATUS_PENDING,
        expires_at=expires_at,
    )
    db.add(challenge)
    db.flush()

    # In-app notification for opponent
    notification_service.create_notification(
        db=db,
        user_id=opponent.id,
        type_=TYPE_PEER_CHALLENGE,
        title="New Peer Duel Challenge",
        body=f"{challenger.display_name} challenged you to a duel on {topic_name}!",
        link="/peer-match",
    )
    db.commit()
    db.refresh(challenge)
    return challenge


def list_challenges(db: Session, user: User) -> list[ChallengeDetail]:
    challenges = list(
        db.scalars(
            select(PeerChallenge)
            .options(
                selectinload(PeerChallenge.challenger),
                selectinload(PeerChallenge.opponent),
                selectinload(PeerChallenge.winner),
            )
            .where(
                or_(
                    PeerChallenge.challenger_id == user.id,
                    PeerChallenge.opponent_id == user.id,
                )
            )
            .order_by(PeerChallenge.created_at.desc())
        ).all()
    )
    _expire_stale_challenges(db, challenges)
    return [_to_detail(c, user.id) for c in challenges]


def get_challenge(db: Session, user: User, challenge_id: uuid.UUID) -> ChallengeDetail:
    challenge = db.scalar(
        select(PeerChallenge)
        .options(
            selectinload(PeerChallenge.challenger),
            selectinload(PeerChallenge.opponent),
            selectinload(PeerChallenge.winner),
        )
        .where(PeerChallenge.id == challenge_id)
    )
    if not challenge:
        raise NotFoundError("Challenge not found")
    if user.id not in (challenge.challenger_id, challenge.opponent_id):
        raise ForbiddenError("You are not part of this duel")

    _expire_stale_challenges(db, [challenge])
    return _to_detail(challenge, user.id)


def accept_challenge(
    db: Session,
    embedder: Embedder,
    llm: GroqService,
    user: User,
    challenge_id: uuid.UUID,
) -> ChallengeDetail:
    challenge = db.scalar(
        select(PeerChallenge)
        .options(
            selectinload(PeerChallenge.challenger),
            selectinload(PeerChallenge.opponent),
        )
        .where(PeerChallenge.id == challenge_id)
    )
    if not challenge:
        raise NotFoundError("Challenge not found")
    if user.id != challenge.opponent_id:
        raise ForbiddenError("Only the challenged student can accept this duel")

    _expire_stale_challenges(db, [challenge])
    if challenge.status != STATUS_PENDING:
        raise BadRequestError(f"Cannot accept a challenge with status '{challenge.status}'")

    settings = get_settings()

    # Generate a quiz for challenger from challenger's material
    challenger_quiz_detail = quiz_service.generate_quiz(
        db=db,
        embedder=embedder,
        llm=llm,
        user_id=challenge.challenger_id,
        request=GenerateQuizRequest(
            topic=challenge.topic_name,
            difficulty=challenge.difficulty,  # type: ignore[arg-type]
            num_questions=settings.peer_challenge_questions,
        ),
    )
    # Generate a quiz for opponent from opponent's material
    opponent_quiz_detail = quiz_service.generate_quiz(
        db=db,
        embedder=embedder,
        llm=llm,
        user_id=challenge.opponent_id,
        request=GenerateQuizRequest(
            topic=challenge.topic_name,
            difficulty=challenge.difficulty,  # type: ignore[arg-type]
            num_questions=settings.peer_challenge_questions,
        ),
    )

    # Mark quizzes with kind = KIND_PEER_DUEL
    ch_quiz = db.scalar(select(Quiz).where(Quiz.id == challenger_quiz_detail.id))
    op_quiz = db.scalar(select(Quiz).where(Quiz.id == opponent_quiz_detail.id))
    if ch_quiz:
        ch_quiz.kind = KIND_PEER_DUEL
    if op_quiz:
        op_quiz.kind = KIND_PEER_DUEL

    challenge.challenger_quiz_id = challenger_quiz_detail.id
    challenge.opponent_quiz_id = opponent_quiz_detail.id
    challenge.status = STATUS_ACCEPTED
    challenge.expires_at = datetime.now(UTC) + timedelta(
        seconds=settings.peer_challenge_time_limit_seconds
    )
    db.flush()

    # Notify challenger
    notification_service.create_notification(
        db=db,
        user_id=challenge.challenger_id,
        type_=TYPE_PEER_CHALLENGE,
        title="Challenge Accepted!",
        body=(
            f"{challenge.opponent.display_name} accepted your duel on {challenge.topic_name}. "
            "You have 10 minutes to complete your quiz!"
        ),
        link="/peer-match",
    )
    db.commit()
    db.refresh(challenge)
    return _to_detail(challenge, user.id)


def decline_challenge(db: Session, user: User, challenge_id: uuid.UUID) -> ChallengeDetail:
    challenge = db.scalar(
        select(PeerChallenge)
        .options(selectinload(PeerChallenge.challenger), selectinload(PeerChallenge.opponent))
        .where(PeerChallenge.id == challenge_id)
    )
    if not challenge:
        raise NotFoundError("Challenge not found")
    if user.id != challenge.opponent_id:
        raise ForbiddenError("Only the challenged student can decline")

    if challenge.status != STATUS_PENDING:
        raise BadRequestError(f"Cannot decline challenge with status '{challenge.status}'")

    challenge.status = STATUS_DECLINED
    notification_service.create_notification(
        db=db,
        user_id=challenge.challenger_id,
        type_=TYPE_PEER_CHALLENGE,
        title="Challenge Declined",
        body=f"{challenge.opponent.display_name} declined the duel on {challenge.topic_name}.",
        link="/peer-match",
    )
    db.commit()
    db.refresh(challenge)
    return _to_detail(challenge, user.id)


def cancel_challenge(db: Session, user: User, challenge_id: uuid.UUID) -> ChallengeDetail:
    challenge = db.scalar(
        select(PeerChallenge)
        .options(selectinload(PeerChallenge.challenger), selectinload(PeerChallenge.opponent))
        .where(PeerChallenge.id == challenge_id)
    )
    if not challenge:
        raise NotFoundError("Challenge not found")
    if user.id != challenge.challenger_id:
        raise ForbiddenError("Only the challenger can cancel this challenge")

    if challenge.status != STATUS_PENDING:
        raise BadRequestError(f"Cannot cancel challenge with status '{challenge.status}'")

    challenge.status = STATUS_CANCELLED
    db.commit()
    db.refresh(challenge)
    return _to_detail(challenge, user.id)


def submit_challenge_attempt(
    db: Session,
    user: User,
    challenge_id: uuid.UUID,
    answers: list[int],
    time_seconds: int,
) -> ChallengeDetail:
    challenge = db.scalar(
        select(PeerChallenge)
        .options(
            selectinload(PeerChallenge.challenger),
            selectinload(PeerChallenge.opponent),
            selectinload(PeerChallenge.winner),
        )
        .where(PeerChallenge.id == challenge_id)
    )
    if not challenge:
        raise NotFoundError("Challenge not found")
    if user.id not in (challenge.challenger_id, challenge.opponent_id):
        raise ForbiddenError("You are not a participant in this duel")

    if challenge.status != STATUS_ACCEPTED:
        raise BadRequestError(f"Duel is not active (status: {challenge.status})")

    is_challenger = user.id == challenge.challenger_id
    quiz_id = challenge.challenger_quiz_id if is_challenger else challenge.opponent_quiz_id
    if not quiz_id:
        raise BadRequestError("Quiz for this duel has not been initialized")

    # Check if already submitted
    if is_challenger and challenge.challenger_score is not None:
        raise BadRequestError("You have already submitted your duel attempt")
    if not is_challenger and challenge.opponent_score is not None:
        raise BadRequestError("You have already submitted your duel attempt")

    # Submit to regular quiz service (updates TopicProgress properly)
    questions = sorted(
        quiz_service._owned_quiz(db, user.id, quiz_id).questions, key=lambda q: q.position
    )
    if len(answers) != len(questions):
        raise BadRequestError("Answer every question before submitting", "invalid_answers")
    attempt_res = quiz_service.submit_attempt(
        db=db,
        user_id=user.id,
        quiz_id=quiz_id,
        answers={q.id: choice for q, choice in zip(questions, answers, strict=True)},
    )

    if is_challenger:
        challenge.challenger_score = attempt_res.score
        challenge.challenger_total = attempt_res.total_questions
        challenge.challenger_time_seconds = time_seconds
    else:
        challenge.opponent_score = attempt_res.score
        challenge.opponent_total = attempt_res.total_questions
        challenge.opponent_time_seconds = time_seconds

    # If both submitted, conclude the duel!
    if challenge.challenger_score is not None and challenge.opponent_score is not None:
        challenge.status = STATUS_COMPLETED
        challenge.completed_at = datetime.now(UTC)

        ch_s = challenge.challenger_score
        op_s = challenge.opponent_score
        ch_t = challenge.challenger_time_seconds or 0
        op_t = challenge.opponent_time_seconds or 0

        if ch_s > op_s:
            challenge.winner_id = challenge.challenger_id
        elif op_s > ch_s:
            challenge.winner_id = challenge.opponent_id
        else:
            # Score tied: fastest time wins
            if ch_t < op_t:
                challenge.winner_id = challenge.challenger_id
            elif op_t < ch_t:
                challenge.winner_id = challenge.opponent_id
            else:
                challenge.winner_id = None  # Exact tie

        # Notifications for both
        winner_name = (
            challenge.challenger.display_name
            if challenge.winner_id == challenge.challenger_id
            else challenge.opponent.display_name
            if challenge.winner_id == challenge.opponent_id
            else None
        )
        msg = (
            f"Duel on {challenge.topic_name} finished! Winner: {winner_name}"
            if winner_name
            else f"Duel on {challenge.topic_name} ended in a tie!"
        )
        notification_service.create_notification(
            db=db,
            user_id=challenge.challenger_id,
            type_=TYPE_PEER_RESULT,
            title="Peer Duel Result",
            body=msg,
            link="/peer-match",
        )
        notification_service.create_notification(
            db=db,
            user_id=challenge.opponent_id,
            type_=TYPE_PEER_RESULT,
            title="Peer Duel Result",
            body=msg,
            link="/peer-match",
        )

    db.commit()
    db.refresh(challenge)
    return _to_detail(challenge, user.id)


def block_user(
    db: Session, user: User, blocked_user_id: uuid.UUID, reason: str | None = None
) -> PeerBlock:
    if user.id == blocked_user_id:
        raise BadRequestError("Cannot block yourself")
    existing = db.scalar(
        select(PeerBlock).where(
            PeerBlock.user_id == user.id,
            PeerBlock.blocked_user_id == blocked_user_id,
        )
    )
    if existing:
        return existing
    block = PeerBlock(user_id=user.id, blocked_user_id=blocked_user_id, reason=reason)
    db.add(block)
    db.commit()
    db.refresh(block)
    return block


def unblock_user(db: Session, user: User, blocked_user_id: uuid.UUID) -> None:
    block = db.scalar(
        select(PeerBlock).where(
            PeerBlock.user_id == user.id,
            PeerBlock.blocked_user_id == blocked_user_id,
        )
    )
    if block:
        db.delete(block)
        db.commit()


def list_blocks(db: Session, user: User) -> list[dict[str, Any]]:
    blocks = db.scalars(
        select(PeerBlock)
        .options(selectinload(PeerBlock.blocked_user))
        .where(PeerBlock.user_id == user.id)
        .order_by(PeerBlock.created_at.desc())
    ).all()
    return [
        {
            "id": b.id,
            "blocked_user_id": b.blocked_user_id,
            "display_name": b.blocked_user.display_name if b.blocked_user else "Unknown",
            "created_at": b.created_at,
        }
        for b in blocks
    ]


def _to_detail(c: PeerChallenge, user_id: uuid.UUID) -> ChallengeDetail:
    is_ch = user_id == c.challenger_id
    winner_name = None
    if c.winner_id:
        if c.winner:
            winner_name = c.winner.display_name
        elif c.winner_id == c.challenger_id:
            winner_name = c.challenger.display_name
        elif c.winner_id == c.opponent_id:
            winner_name = c.opponent.display_name

    return ChallengeDetail(
        id=c.id,
        challenger_id=c.challenger_id,
        challenger_name=c.challenger.display_name if c.challenger else "Challenger",
        opponent_id=c.opponent_id,
        opponent_name=c.opponent.display_name if c.opponent else "Opponent",
        topic_name=c.topic_name,
        difficulty=c.difficulty,
        status=c.status,
        challenger_quiz_id=c.challenger_quiz_id,
        opponent_quiz_id=c.opponent_quiz_id,
        challenger_score=c.challenger_score,
        challenger_total=c.challenger_total,
        challenger_time_seconds=c.challenger_time_seconds,
        opponent_score=c.opponent_score,
        opponent_total=c.opponent_total,
        opponent_time_seconds=c.opponent_time_seconds,
        winner_id=c.winner_id,
        winner_name=winner_name,
        expires_at=c.expires_at,
        created_at=c.created_at,
        completed_at=c.completed_at,
        my_role="challenger" if is_ch else "opponent",
        my_quiz_id=c.challenger_quiz_id if is_ch else c.opponent_quiz_id,
        my_completed=c.challenger_score is not None if is_ch else c.opponent_score is not None,
        opponent_completed=c.opponent_score is not None
        if is_ch
        else c.challenger_score is not None,
    )
