import uuid
from dataclasses import dataclass


class AnswerError(ValueError):
    """The submitted answers do not match the quiz."""


@dataclass(frozen=True)
class QuestionKey:
    id: uuid.UUID
    option_count: int
    correct_index: int


@dataclass(frozen=True)
class GradedAnswer:
    question_id: uuid.UUID
    selected_index: int
    is_correct: bool


def grade(
    questions: list[QuestionKey], answers: dict[uuid.UUID, int]
) -> tuple[int, list[GradedAnswer]]:
    """Grade one answer per question. Every question must be answered, nothing else accepted."""
    expected = {q.id: q for q in questions}
    unknown = set(answers) - set(expected)
    if unknown:
        raise AnswerError("Some answers do not belong to this quiz")
    missing = set(expected) - set(answers)
    if missing:
        raise AnswerError("Please answer every question before submitting")
    graded: list[GradedAnswer] = []
    for q in questions:
        selected = answers[q.id]
        if not 0 <= selected < q.option_count:
            raise AnswerError("An answer refers to an option that does not exist")
        graded.append(GradedAnswer(q.id, selected, selected == q.correct_index))
    return sum(g.is_correct for g in graded), graded
