import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession, EmbedderDep, LLMDep
from app.schemas.peer_match import (
    BlockedUserOut,
    BlockUserRequest,
    ChallengeDetail,
    CreateChallengeRequest,
    PeerMatchCandidate,
    SubmitChallengeQuizRequest,
)
from app.services import peer_match_service

router = APIRouter(prefix="/peer-match", tags=["peer-match"])


@router.get("/matches", response_model=list[PeerMatchCandidate])
def get_matches(user: CurrentUser, db: DbSession) -> list[PeerMatchCandidate]:
    return peer_match_service.find_matches(db=db, user=user)


@router.get("/challenges", response_model=list[ChallengeDetail])
def list_challenges(user: CurrentUser, db: DbSession) -> list[ChallengeDetail]:
    return peer_match_service.list_challenges(db=db, user=user)


@router.post("/challenges", response_model=ChallengeDetail)
def create_challenge(
    body: CreateChallengeRequest,
    user: CurrentUser,
    db: DbSession,
) -> ChallengeDetail:
    challenge = peer_match_service.create_challenge(
        db=db,
        challenger=user,
        opponent_id=body.opponent_id,
        topic_name=body.topic_name,
        difficulty=body.difficulty,
    )
    return peer_match_service.get_challenge(db, user, challenge.id)


@router.get("/challenges/{challenge_id}", response_model=ChallengeDetail)
def get_challenge(
    challenge_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> ChallengeDetail:
    return peer_match_service.get_challenge(db=db, user=user, challenge_id=challenge_id)


@router.post("/challenges/{challenge_id}/accept", response_model=ChallengeDetail)
def accept_challenge(
    challenge_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    embedder: EmbedderDep,
    llm: LLMDep,
) -> ChallengeDetail:
    return peer_match_service.accept_challenge(
        db=db,
        embedder=embedder,
        llm=llm,
        user=user,
        challenge_id=challenge_id,
    )


@router.post("/challenges/{challenge_id}/decline", response_model=ChallengeDetail)
def decline_challenge(
    challenge_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> ChallengeDetail:
    return peer_match_service.decline_challenge(db=db, user=user, challenge_id=challenge_id)


@router.post("/challenges/{challenge_id}/cancel", response_model=ChallengeDetail)
def cancel_challenge(
    challenge_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> ChallengeDetail:
    return peer_match_service.cancel_challenge(db=db, user=user, challenge_id=challenge_id)


@router.post("/challenges/{challenge_id}/submit", response_model=ChallengeDetail)
def submit_challenge_attempt(
    challenge_id: uuid.UUID,
    body: SubmitChallengeQuizRequest,
    user: CurrentUser,
    db: DbSession,
) -> ChallengeDetail:
    return peer_match_service.submit_challenge_attempt(
        db=db,
        user=user,
        challenge_id=challenge_id,
        answers=body.answers,
        time_seconds=body.time_seconds,
    )


@router.post("/block", response_model=BlockedUserOut)
def block_user(
    body: BlockUserRequest,
    user: CurrentUser,
    db: DbSession,
) -> BlockedUserOut:
    block = peer_match_service.block_user(
        db=db, user=user, blocked_user_id=body.blocked_user_id, reason=body.reason
    )
    return BlockedUserOut(
        id=block.id,
        blocked_user_id=block.blocked_user_id,
        display_name=block.blocked_user.display_name if block.blocked_user else "Blocked User",
        created_at=block.created_at,
    )


@router.delete("/block/{blocked_user_id}")
def unblock_user(
    blocked_user_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
) -> dict[str, str]:
    peer_match_service.unblock_user(db=db, user=user, blocked_user_id=blocked_user_id)
    return {"status": "unblocked"}


@router.get("/blocks", response_model=list[BlockedUserOut])
def list_blocks(
    user: CurrentUser,
    db: DbSession,
) -> list[BlockedUserOut]:
    blocks = peer_match_service.list_blocks(db=db, user=user)
    return [BlockedUserOut(**b) for b in blocks]
