import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PeerMatchCandidate(BaseModel):
    user_id: uuid.UUID
    display_name: str
    topic_name: str
    in_same_class: bool


class CreateChallengeRequest(BaseModel):
    opponent_id: uuid.UUID
    topic_name: str = Field(min_length=1, max_length=120)
    difficulty: Literal["beginner", "intermediate", "advanced"] | None = None


class ChallengeDetail(BaseModel):
    id: uuid.UUID
    challenger_id: uuid.UUID
    challenger_name: str
    opponent_id: uuid.UUID
    opponent_name: str
    topic_name: str
    difficulty: str
    status: str
    challenger_quiz_id: uuid.UUID | None = None
    opponent_quiz_id: uuid.UUID | None = None
    challenger_score: int | None = None
    challenger_total: int | None = None
    challenger_time_seconds: int | None = None
    opponent_score: int | None = None
    opponent_total: int | None = None
    opponent_time_seconds: int | None = None
    winner_id: uuid.UUID | None = None
    winner_name: str | None = None
    expires_at: datetime
    created_at: datetime
    completed_at: datetime | None = None
    my_role: Literal["challenger", "opponent"]
    my_quiz_id: uuid.UUID | None = None
    my_completed: bool = False
    opponent_completed: bool = False


class SubmitChallengeQuizRequest(BaseModel):
    answers: list[int] = Field(min_length=1)
    time_seconds: int = Field(ge=0, le=3600)


class BlockUserRequest(BaseModel):
    blocked_user_id: uuid.UUID
    reason: str | None = Field(default=None, max_length=255)


class BlockedUserOut(BaseModel):
    id: uuid.UUID
    blocked_user_id: uuid.UUID
    display_name: str
    created_at: datetime
