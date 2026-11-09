from dataclasses import dataclass

from app.core.config import get_settings

INSUFFICIENT_DATA = "insufficient_data"
NEEDS_REVISION = "needs_revision"
PRACTICING = "practicing"
DOING_WELL = "doing_well"

STATUS_DESCRIPTIONS = {
    INSUFFICIENT_DATA: "Not enough answers yet to judge this topic",
    NEEDS_REVISION: "Accuracy is below the revision threshold",
    PRACTICING: "Accuracy is between the revision and doing-well thresholds",
    DOING_WELL: "Accuracy is at or above the doing-well threshold",
}


@dataclass(frozen=True)
class Thresholds:
    min_attempts: int = 3
    needs_revision_below: int = 60  # percent
    doing_well_from: int = 80  # percent

    @classmethod
    def from_settings(cls) -> "Thresholds":
        s = get_settings()
        return cls(
            s.mastery_min_attempts, s.mastery_needs_revision_below, s.mastery_doing_well_from
        )


@dataclass(frozen=True)
class Recommendation:
    action: str
    message: str


def classify(correct: int, attempted: int, t: Thresholds | None = None) -> str:
    """Rule-based topic status. Integer arithmetic keeps the exact boundaries exact:
    60% is "practicing" and 80% is "doing_well"."""
    t = t or Thresholds.from_settings()
    if attempted < t.min_attempts:
        return INSUFFICIENT_DATA
    if correct * 100 < t.needs_revision_below * attempted:
        return NEEDS_REVISION
    if correct * 100 >= t.doing_well_from * attempted:
        return DOING_WELL
    return PRACTICING


def recommend(
    topic: str, correct: int, attempted: int, t: Thresholds | None = None
) -> Recommendation:
    status = classify(correct, attempted, t)
    score = f"{correct}/{attempted}"
    if status == NEEDS_REVISION:
        return Recommendation(
            "review_then_beginner_quiz",
            f"You answered {score} correctly on {topic}, so review the linked notes "
            "and try a beginner quiz.",
        )
    if status == PRACTICING:
        return Recommendation(
            "practice_again",
            f"You answered {score} correctly on {topic}. Another practice quiz on the same topic "
            "should help.",
        )
    if status == DOING_WELL:
        return Recommendation(
            "harder_quiz",
            f"You answered {score} correctly on {topic}. "
            "Try a harder quiz or move on to the next topic.",
        )
    return Recommendation(
        "take_more_quizzes",
        f"You have answered {attempted} question{'s' if attempted != 1 else ''} on {topic}. "
        "Take another quiz on it to see how you are doing.",
    )


def percent(correct: int, attempted: int) -> int | None:
    return round(correct * 100 / attempted) if attempted else None
