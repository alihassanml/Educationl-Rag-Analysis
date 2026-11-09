import pytest

from app.services.recommendation_service import (
    DOING_WELL,
    INSUFFICIENT_DATA,
    NEEDS_REVISION,
    PRACTICING,
    Thresholds,
    classify,
    percent,
    recommend,
)

T = Thresholds(min_attempts=3, needs_revision_below=60, doing_well_from=80)


@pytest.mark.parametrize(
    ("correct", "attempted", "expected"),
    [
        (0, 0, INSUFFICIENT_DATA),  # no attempts
        (2, 2, INSUFFICIENT_DATA),  # perfect but too few answers to judge
        (0, 2, INSUFFICIENT_DATA),
        (1, 3, NEEDS_REVISION),  # 3 attempts, low accuracy
        (0, 3, NEEDS_REVISION),
        (59, 100, NEEDS_REVISION),  # just under 60%
        (3, 5, PRACTICING),  # exactly 60%
        (60, 100, PRACTICING),
        (79, 100, PRACTICING),  # just under 80%
        (7, 9, PRACTICING),  # 77.8%
        (4, 5, DOING_WELL),  # exactly 80%
        (80, 100, DOING_WELL),
        (5, 5, DOING_WELL),
    ],
)
def test_classification_boundaries(correct: int, attempted: int, expected: str) -> None:
    assert classify(correct, attempted, T) == expected


def test_student_improving_across_attempts_moves_up_a_status() -> None:
    cumulative = [(1, 5), (3, 10), (9, 15), (15, 20)]  # running totals after each quiz
    statuses = [classify(c, a, T) for c, a in cumulative]
    assert statuses == [NEEDS_REVISION, NEEDS_REVISION, PRACTICING, PRACTICING]
    assert classify(17, 20, T) == DOING_WELL


def test_thresholds_are_configurable() -> None:
    strict = Thresholds(min_attempts=5, needs_revision_below=70, doing_well_from=90)
    assert classify(3, 4, strict) == INSUFFICIENT_DATA
    assert classify(7, 10, strict) == PRACTICING
    assert classify(6, 10, strict) == NEEDS_REVISION


@pytest.mark.parametrize(
    ("correct", "attempted", "action"),
    [
        (2, 5, "review_then_beginner_quiz"),
        (3, 5, "practice_again"),
        (5, 5, "harder_quiz"),
        (1, 2, "take_more_quizzes"),
    ],
)
def test_recommendation_action_matches_status(correct: int, attempted: int, action: str) -> None:
    assert recommend("Recursion", correct, attempted, T).action == action


def test_recommendation_message_is_explainable() -> None:
    message = recommend("Recursion", 2, 5, T).message
    assert "2/5" in message and "Recursion" in message


def test_percent_handles_zero_attempts() -> None:
    assert percent(0, 0) is None
    assert percent(3, 4) == 75
