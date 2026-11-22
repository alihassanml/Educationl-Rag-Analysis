"""Mood-aware pacing: noticing from what a student answered that they are struggling, and starting
a lighter step on the topic. The signals are plain counts of recent answers and scores, so the rule
can be read, tested and explained. Nothing here guesses at feelings."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.quiz import LightEpisode, Question, QuestionResponse, Quiz, QuizAttempt, Topic
from app.models.user import User
from app.schemas.light_mode import LightModeNotice

REASON_NEEDS_SUPPORT = "needs_support"
REASON_WRONG_STREAK = "wrong_streak"
REASON_LOW_SCORES = "low_scores"
OUTCOME_PASSED = "passed"


@dataclass(frozen=True)
class MoodRule:
    wrong_streak: int = 3
    low_score_below: int = 40  # percent
    low_score_attempts: int = 2

    @classmethod
    def from_settings(cls) -> "MoodRule":
        s = get_settings()
        return cls(s.mood_wrong_streak, s.mood_low_score_percent, s.mood_low_score_attempts)


def detect(
    recent_answers: list[bool],
    recent_scores: list[tuple[int, int]],
    needs_support: bool,
    rule: MoodRule | None = None,
) -> str | None:
    """Why a lighter step is due, or None. Any one signal is enough.

    `recent_answers` are the student's latest answers, newest first (True = correct).
    `recent_scores` are their latest quiz results as (correct, total), newest first.
    """
    rule = rule or MoodRule.from_settings()
    if needs_support:
        return REASON_NEEDS_SUPPORT
    streak = rule.wrong_streak
    if streak > 0 and len(recent_answers) >= streak and not any(recent_answers[:streak]):
        return REASON_WRONG_STREAK
    runs = rule.low_score_attempts
    latest = recent_scores[:runs]
    if (
        runs > 0
        and len(latest) == runs
        and all(
            total > 0 and correct * 100 < rule.low_score_below * total for correct, total in latest
        )
    ):
        return REASON_LOW_SCORES
    return None


def passed_confidence(score: int, total: int) -> bool:
    """A confidence quiz is passed with the configured number right (or all, if it was shorter)."""
    return total > 0 and score >= min(get_settings().confidence_pass_correct, total)


def _recent_answers(db: Session, user_id: uuid.UUID, limit: int) -> list[bool]:
    rows = db.execute(
        select(QuestionResponse.is_correct)
        .join(QuizAttempt, QuizAttempt.id == QuestionResponse.attempt_id)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .join(Question, Question.id == QuestionResponse.question_id)
        .where(QuizAttempt.user_id == user_id, Quiz.kind == "practice")
        .order_by(QuizAttempt.completed_at.desc(), Question.position.desc())
        .limit(limit)
    )
    return [row[0] for row in rows]


def _recent_scores(db: Session, user_id: uuid.UUID, limit: int) -> list[tuple[int, int]]:
    rows = db.execute(
        select(QuizAttempt.score, QuizAttempt.total_questions)
        .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
        .where(QuizAttempt.user_id == user_id, Quiz.kind == "practice")
        .order_by(QuizAttempt.completed_at.desc())
        .limit(limit)
    )
    return [(row[0], row[1]) for row in rows]


def active_episode(db: Session, user_id: uuid.UUID, topic_id: uuid.UUID) -> LightEpisode | None:
    return db.scalar(
        select(LightEpisode)
        .where(
            LightEpisode.user_id == user_id,
            LightEpisode.topic_id == topic_id,
            LightEpisode.ended_at.is_(None),
        )
        .order_by(LightEpisode.started_at.desc())
        .limit(1)
    )


def latest_episode(db: Session, user_id: uuid.UUID, topic_id: uuid.UUID) -> LightEpisode | None:
    return db.scalar(
        select(LightEpisode)
        .where(LightEpisode.user_id == user_id, LightEpisode.topic_id == topic_id)
        .order_by(LightEpisode.started_at.desc())
        .limit(1)
    )


def maybe_start(
    db: Session, user_id: uuid.UUID, topic_id: uuid.UUID, needs_support: bool
) -> LightEpisode | None:
    """After a practice quiz: start a lighter step on its topic when the signals say so, the student
    has not turned light mode off, and one is not already running for the topic."""
    user = db.get(User, user_id)
    if user is None or not user.lighter_steps_enabled:
        return None
    existing = active_episode(db, user_id, topic_id)
    if existing is not None:
        return existing
    rule = MoodRule.from_settings()
    reason = detect(
        _recent_answers(db, user_id, rule.wrong_streak),
        _recent_scores(db, user_id, rule.low_score_attempts),
        needs_support,
        rule,
    )
    if reason is None:
        return None
    episode = LightEpisode(user_id=user_id, topic_id=topic_id, reason=reason)
    db.add(episode)
    db.flush()
    return episode


def finish(db: Session, episode: LightEpisode) -> None:
    episode.ended_at = datetime.now(UTC)
    episode.outcome = OUTCOME_PASSED


def active_topic_ids(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, uuid.UUID]:
    """topic id -> episode id of the running light-mode episodes (none when switched off)."""
    user = db.get(User, user_id)
    if user is None or not user.lighter_steps_enabled:
        return {}
    rows = db.execute(
        select(LightEpisode.topic_id, LightEpisode.id)
        .where(LightEpisode.user_id == user_id, LightEpisode.ended_at.is_(None))
        .order_by(LightEpisode.started_at)
    )
    return {topic_id: episode_id for topic_id, episode_id in rows}


def topic_name(db: Session, topic_id: uuid.UUID) -> str:
    return db.scalar(select(Topic.name).where(Topic.id == topic_id)) or "this topic"


def notice(
    db: Session, user_id: uuid.UUID, quiz: Quiz, attempt: QuizAttempt
) -> LightModeNotice | None:
    """What a finished quiz means for light mode, in supportive and neutral words."""
    if quiz.topic_id is None:
        return None
    name = topic_name(db, quiz.topic_id)
    if quiz.kind == "confidence":
        episode = latest_episode(db, user_id, quiz.topic_id)
        if episode is None:
            return None
        if passed_confidence(attempt.score, attempt.total_questions):
            return LightModeNotice(
                episode_id=episode.id,
                topic_id=quiz.topic_id,
                topic=name,
                state="passed",
                message=f"Well done. You are back on your normal path for {name}.",
            )
        if episode.ended_at is None:
            return LightModeNotice(
                episode_id=episode.id,
                topic_id=quiz.topic_id,
                topic=name,
                state="active",
                message=(
                    f"Not quite yet. Look over the recap again, then try another short quiz "
                    f"on {name}."
                ),
            )
        return None
    episode = active_episode(db, user_id, quiz.topic_id)
    user = db.get(User, user_id)
    if episode is None or user is None or not user.lighter_steps_enabled:
        return None
    return LightModeNotice(
        episode_id=episode.id,
        topic_id=quiz.topic_id,
        topic=name,
        state="active",
        message=(
            f"Let's take a lighter step on {name}: a quick recap, then a short confidence quiz."
        ),
    )


def on_confidence_result(
    db: Session, user_id: uuid.UUID, quiz: Quiz, score: int, total: int
) -> bool:
    """A confidence quiz was submitted. Passing it ends the topic's light-mode episode, so the
    next quiz is back at the topic's normal level. Returns True on a pass."""
    if quiz.topic_id is None or not passed_confidence(score, total):
        return False
    episode = active_episode(db, user_id, quiz.topic_id)
    if episode is not None:
        finish(db, episode)
    return True
