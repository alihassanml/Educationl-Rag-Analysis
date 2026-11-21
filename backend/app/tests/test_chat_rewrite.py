from app.services.groq_service import LLMOutputError, LLMUnavailableError
from app.services.rewrite_service import rewrite_followup

HISTORY = [
    ("user", "What is recursion?"),
    ("assistant", "Recursion is a method where a function calls itself [1]."),
]


def test_first_message_is_searched_as_typed_without_a_model_call(fake_groq) -> None:
    result = rewrite_followup(fake_groq, [], "What is recursion?")
    assert result.query == "What is recursion?"
    assert (result.ran, result.changed, result.fallback) == (False, False, False)
    assert fake_groq.calls == []


def test_follow_up_is_rewritten_into_a_standalone_question(fake_groq) -> None:
    fake_groq.replies.append({"standalone_question": "What is the base case of recursion?"})
    result = rewrite_followup(fake_groq, HISTORY, "What about its base case?")
    assert result.query == "What is the base case of recursion?"
    assert (result.ran, result.changed, result.fallback) == (True, True, False)
    prompt = fake_groq.calls[0]["user"]
    assert "What is recursion?" in prompt and "What about its base case?" in prompt


def test_an_already_standalone_question_is_not_marked_as_changed(fake_groq) -> None:
    fake_groq.replies.append({"standalone_question": "  What is a stack?  "})
    result = rewrite_followup(fake_groq, HISTORY, "What is a stack?")
    assert result.query == "What is a stack?"
    assert result.ran is True and result.changed is False


def test_model_failure_falls_back_to_the_original_question(fake_groq) -> None:
    for error in (LLMUnavailableError("busy"), LLMOutputError("bad json")):
        fake_groq.replies.append(error)
        result = rewrite_followup(fake_groq, HISTORY, "What about its base case?")
        assert result.query == "What about its base case?"
        assert (result.ran, result.changed, result.fallback) == (True, False, True)


def test_unusable_rewrites_fall_back(fake_groq) -> None:
    for reply in ({"standalone_question": "   "}, {"other": "x"}, {"standalone_question": 5}):
        fake_groq.replies.append(reply)
        result = rewrite_followup(fake_groq, HISTORY, "And its base case?")
        assert result.query == "And its base case?" and result.fallback is True
    fake_groq.replies.append({"standalone_question": "x" * 2000})  # runaway output
    assert rewrite_followup(fake_groq, HISTORY, "And its base case?").fallback is True


def test_only_recent_turns_are_sent_and_long_answers_are_trimmed(fake_groq) -> None:
    history = [("user", f"old question {i}") for i in range(20)]
    history.append(("assistant", "long answer " + "word " * 500))
    fake_groq.replies.append({"standalone_question": "Next question?"})
    rewrite_followup(fake_groq, history, "Next one?")
    prompt = fake_groq.calls[0]["user"]
    assert "old question 0" not in prompt and "old question 19" in prompt
    assert len(prompt) < 3000
