import uuid

import pytest

from app.services.scoring_service import AnswerError, QuestionKey, grade

Q1, Q2, Q3 = (uuid.uuid4() for _ in range(3))
KEYS = [QuestionKey(Q1, 4, 0), QuestionKey(Q2, 4, 2), QuestionKey(Q3, 4, 3)]


def test_counts_correct_answers() -> None:
    score, graded = grade(KEYS, {Q1: 0, Q2: 1, Q3: 3})
    assert score == 2
    assert [g.is_correct for g in graded] == [True, False, True]


def test_all_wrong_and_all_right_boundaries() -> None:
    assert grade(KEYS, {Q1: 1, Q2: 0, Q3: 0})[0] == 0
    assert grade(KEYS, {Q1: 0, Q2: 2, Q3: 3})[0] == 3


@pytest.mark.parametrize(
    "answers",
    [
        {Q1: 0, Q2: 2},  # missing one
        {Q1: 0, Q2: 2, Q3: 3, uuid.uuid4(): 0},  # unknown question
        {Q1: 0, Q2: 2, Q3: 4},  # option out of range
        {Q1: -1, Q2: 2, Q3: 3},
    ],
)
def test_invalid_submissions_rejected(answers: dict) -> None:
    with pytest.raises(AnswerError):
        grade(KEYS, answers)
