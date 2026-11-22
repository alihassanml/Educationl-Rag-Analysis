import uuid

import pytest

from app.services import intent_service as intent

DOCS = [(uuid.uuid4(), "Phynxa Website Knowledge Base (RAG Source)"), (uuid.uuid4(), "Biology")]


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("quiz me all topic maximum 10 quiz", 10),
        ("Quiz me on the topics, with up to 10 questions.", 10),
        ("give me 3 questions on recursion", 3),
        ("5 mcqs please", 5),
        ("max 4", 4),
        ("quiz me on everything with 50 questions", 10),
        ("quiz me", 5),
        ("0 questions", 1),
    ],
)
def test_requested_question_count(question: str, expected: int) -> None:
    assert intent.requested_question_count(question) == expected


@pytest.mark.parametrize(
    "question",
    [
        "Explain the hardest topic in Phynxa Website Knowledge Base (RAG Source) simply",
        "summarise all topics",
        "what are the main points",
        "give me an overview",
        "What should I remember from Biology for an exam?",
    ],
)
def test_broad_requests_are_recognised(question: str) -> None:
    assert intent.is_broad_request(question, documents=DOCS)


@pytest.mark.parametrize("mode", ["quiz", "summary", "simple"])
def test_a_bare_command_in_a_mode_has_no_topic(mode: str) -> None:
    assert intent.is_broad_request("quiz me", mode=mode)
    assert intent.is_broad_request("Quiz me on the topics, with up to 10 questions.", mode=mode)


@pytest.mark.parametrize(
    "question",
    ["What is recursion?", "quiz me on quantum chromodynamics", "who won the world cup"],
)
def test_specific_questions_are_not_broad(question: str) -> None:
    assert not intent.is_broad_request(question, mode="quiz", documents=DOCS)
    assert intent.has_specific_topic(question)


def test_ask_mode_alone_is_never_broad() -> None:
    assert not intent.is_broad_request("quiz me", mode="ask")


def test_mentioned_documents_match_titles_case_insensitively() -> None:
    assert intent.mentioned_documents("hardest topic in BIOLOGY?", DOCS) == [DOCS[1][0]]
    assert intent.mentioned_documents("nothing here", DOCS) == []
    assert intent.mentioned_documents("a b c", [(uuid.uuid4(), "abc")]) == []  # too short to match


@pytest.mark.parametrize(
    ("message", "kind"),
    [
        ("hi", "greeting"),
        ("Hello!", "greeting"),
        ("hey there", "greeting"),
        ("Good morning", "greeting"),
        ("assalam o alaikum", "greeting"),
        ("thanks", "thanks"),
        ("thank you so much!", "thanks"),
        ("ok", "thanks"),
        ("bye", "bye"),
        ("what can you do?", "help"),
        ("help", "help"),
        ("how does this work", "help"),
    ],
)
def test_small_talk_is_recognised(message: str, kind: str) -> None:
    assert intent.smalltalk_kind(message) == kind


@pytest.mark.parametrize(
    "message",
    [
        "hi, what is recursion?",
        "thanks but what about the base case",
        "what is a hello world program",
        "help me understand pointers",
        "ok so how does recursion end",
        "x" * 80,
    ],
)
def test_real_questions_are_never_small_talk(message: str) -> None:
    assert intent.smalltalk_kind(message) is None


def test_the_greeting_names_the_documents_that_really_exist() -> None:
    assert "Add a document first" in intent.smalltalk_reply("greeting", [])
    reply = intent.smalltalk_reply("greeting", ["Biology", "Physics"])
    assert "2 documents" in reply and "Biology, Physics" in reply
    assert "1 document " in intent.smalltalk_reply("greeting", ["Biology"])
    assert "Quiz me" in intent.smalltalk_reply("help", [])


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("give me in bullets posint", "bulleted list"),
        ("in bullet points please", "bulleted list"),
        ("as a table", "Markdown table"),
        ("make it shorter", "much shorter"),
        ("tl;dr", "much shorter"),
        ("explain it simply", "simpler"),
        ("tell me more", "more detailed"),
        ("give an example", "concrete example"),
        ("step by step", "numbered list"),
        ("translate to urdu", "in Urdu"),
        ("in Hindi", "in Hindi"),
    ],
)
def test_reformat_requests_are_recognised(message: str, expected: str) -> None:
    assert expected in (intent.reformat_instruction(message) or "")


@pytest.mark.parametrize(
    "message",
    [
        "what is a list in python",
        "how do bullet points work in markdown",
        "why is the table empty",
        "tell me about webhook retries and headers in the knowledge base",
        "what does phynxa provide",
        "webhook events",
        "",
    ],
)
def test_real_questions_are_never_reformat_requests(message: str) -> None:
    assert intent.reformat_instruction(message) is None
