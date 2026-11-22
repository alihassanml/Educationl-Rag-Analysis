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


# Where a topic sits on the study path: needs revision first, doing well last, the rest between
ROUTE_FRONT = 0
ROUTE_MIDDLE = 1
ROUTE_END = 2


def route_group(status: str) -> int:
    if status == NEEDS_REVISION:
        return ROUTE_FRONT
    if status == DOING_WELL:
        return ROUTE_END
    return ROUTE_MIDDLE


def route_change_reason(topic: str, old: str, new: str, correct: int, total: int) -> str | None:
    """Plain words for a topic that moved on the path, or None when it stayed in its place."""
    before, after = route_group(old), route_group(new)
    if before == after:
        return None
    score = f"{correct}/{total}"
    if after == ROUTE_FRONT:
        return f"{topic} moved up because you scored {score}."
    if after == ROUTE_END:
        return f"{topic} moved to review later: you scored {score}."
    if before == ROUTE_FRONT:
        return f"{topic} moved down because you scored {score}, so it no longer needs revision."
    return f"{topic} moved back into your path after you scored {score}."


LEVELS = ("beginner", "intermediate", "advanced")


@dataclass(frozen=True)
class LevelRule:
    up_from: int = 80  # percent
    down_below: int = 50  # percent
    support_after: int = 2  # failed quizzes in a row at beginner

    @classmethod
    def from_settings(cls) -> "LevelRule":
        s = get_settings()
        return cls(s.difficulty_up_from, s.difficulty_down_below, s.support_after_failed_attempts)


def next_level(current: str, correct: int, total: int, rule: LevelRule | None = None) -> str:
    """The level of the next quiz on a topic, from the result of a quiz taken at `current`.
    At or above `up_from` percent: one level up. Below `down_below` percent: one level down.
    Otherwise it stays. Integer arithmetic keeps the boundaries exact: with 80 and 50, a score of
    exactly 80% moves up and exactly 50% stays."""
    rule = rule or LevelRule.from_settings()
    index = LEVELS.index(current) if current in LEVELS else 0
    if total > 0 and correct * 100 >= rule.up_from * total:
        index += 1
    elif total > 0 and correct * 100 < rule.down_below * total:
        index -= 1
    return LEVELS[max(0, min(index, len(LEVELS) - 1))]


def is_failed(correct: int, total: int, rule: LevelRule | None = None) -> bool:
    rule = rule or LevelRule.from_settings()
    return total > 0 and correct * 100 < rule.down_below * total


def next_failed_streak(
    streak: int, difficulty: str, correct: int, total: int, rule: LevelRule | None = None
) -> int:
    """Failed quizzes in a row at beginner level. Any other result ends the run."""
    if difficulty == LEVELS[0] and is_failed(correct, total, rule):
        return streak + 1
    return 0


def needs_support(streak: int, rule: LevelRule | None = None) -> bool:
    rule = rule or LevelRule.from_settings()
    return streak >= rule.support_after


def level_reason(topic: str, correct: int, total: int, previous: str, following: str) -> str:
    """One plain sentence saying why the next quiz has the level it has."""
    score = f"{correct}/{total}"
    if following != previous:
        return f"You scored {score}, so your next quiz on {topic} will be {following}."
    if LEVELS.index(previous) == len(LEVELS) - 1 and not is_failed(correct, total):
        return f"You scored {score}. {topic} is at the top level, so your next quiz stays advanced."
    if previous == LEVELS[0] and is_failed(correct, total):
        return f"You scored {score}. Your next quiz on {topic} stays beginner, so you can build up."
    return f"You scored {score}, so your next quiz on {topic} stays {previous}."


def diagnostic_level(correct: int, asked: int) -> str:
    """The first level of a topic, from its diagnostic questions: none right is beginner, all
    right is advanced, and anything in between that is at least half is intermediate."""
    if asked <= 0 or correct <= 0:
        return LEVELS[0]
    if correct >= asked:
        return LEVELS[2]
    return LEVELS[1] if correct * 2 >= asked else LEVELS[0]


def diagnostic_plan(topic_count: int, max_questions: int) -> list[int]:
    """Questions per topic: one each, then a second for the earliest topics while the total stays
    within `max_questions`. Topics beyond the limit are not asked about."""
    asked = min(topic_count, max_questions)
    extra = min(max_questions - asked, asked)
    return [2 if i < extra else 1 for i in range(asked)]


def percent(correct: int, attempted: int) -> int | None:
    return round(correct * 100 / attempted) if attempted else None
