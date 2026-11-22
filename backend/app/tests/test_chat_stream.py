import json
import uuid

import pytest
from sqlalchemy import select

from app.models.chat import ChatMessage
from app.services.groq_service import LLMUnavailableError
from app.tests.helpers import register, upload

RECURSION = (
    "Recursion is a method where a function calls itself to solve smaller instances of a problem. "
    "Every recursive function needs a base case that stops the calls."
)
QUESTION = "What is recursion and a recursive function base case?"


def parse_sse(text: str) -> list[tuple[str, object]]:
    events = []
    for block in text.strip().split("\n\n"):
        lines = block.split("\n")
        name = next(line[7:] for line in lines if line.startswith("event: "))
        data = "\n".join(line[6:] for line in lines if line.startswith("data: "))
        events.append((name, json.loads(data)))
    return events


def names(events: list[tuple[str, object]]) -> list[str]:
    return [name for name, _ in events]


def _thread(client) -> str:  # type: ignore[no-untyped-def]
    return client.post("/api/v1/tutor/threads", json={}).json()["id"]


def _send(client, thread_id: str, question: str = QUESTION, **extra):  # type: ignore[no-untyped-def]
    return client.post(
        f"/api/v1/tutor/threads/{thread_id}/messages", json={"question": question, **extra}
    )


@pytest.fixture
def chat(auth_client, fake_groq):  # type: ignore[no-untyped-def]
    upload(auth_client, ["Course logistics and grading policy.", RECURSION], title="Notes")
    return auth_client, _thread(auth_client)


def test_answer_streams_status_sources_tokens_then_done_in_order(chat, fake_groq, db) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["A function ", "calls itself ", "[1]."])
    response = _send(client, thread_id)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    events = parse_sse(response.text)
    assert names(events) == ["status", "sources", "status", "token", "token", "token", "done"]
    assert events[0][1] == {"stage": "searching"}
    sources = events[1][1]
    assert [(s["marker"], s["document_title"], s["page_number"]) for s in sources] == [
        (1, "Notes", 2)
    ]
    assert sources[0]["snippet"] and sources[0]["chunk_id"] and sources[0]["document_id"]
    assert events[2][1] == {"stage": "writing"}
    assert (
        "".join(e[1]["text"] for e in events if e[0] == "token") == "A function calls itself [1]."
    )
    done = events[-1][1]
    assert done["abstained"] is False and done["standalone_query"] == QUESTION
    assert set(done["latency_ms"]) == {"rewrite", "retrieve", "generate"}

    thread = client.get(f"/api/v1/tutor/threads/{thread_id}").json()
    user_message, answer = thread["messages"]
    assert (user_message["role"], user_message["content"]) == ("user", QUESTION)
    assert (answer["role"], answer["status"], answer["id"]) == (
        "assistant",
        "complete",
        done["message_id"],
    )
    assert answer["content"] == "A function calls itself [1]."
    assert [
        (c["marker"], c["document_title"], c["source_deleted"]) for c in answer["citations"]
    ] == [(1, "Notes", False)]
    assert thread["title"] == QUESTION[:60]


def test_the_answer_call_sees_only_passages_and_the_standalone_question(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["First answer [1]."])
    _send(client, thread_id)
    fake_groq.replies.append({"standalone_question": QUESTION})
    fake_groq.stream_replies.append(["Second answer [1]."])
    _send(client, thread_id, "Why is that needed?")

    call = fake_groq.stream_calls[1]
    assert "<passages>" in call["user"] and "untrusted" in call["system"]
    assert QUESTION in call["user"]  # the standalone question, not the typed follow-up
    assert "Why is that needed?" not in call["user"]
    assert "First answer" not in call["user"] and "First answer" not in call["system"]


def test_follow_up_is_rewritten_and_the_search_line_is_saved(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["First [1]."])
    first = parse_sse(_send(client, thread_id).text)
    assert "rewriting" not in [e[1].get("stage") for e in first if e[0] == "status"]
    assert fake_groq.calls == []  # no rewrite call on the first message

    fake_groq.replies.append({"standalone_question": QUESTION})
    fake_groq.stream_replies.append(["Second [1]."])
    events = parse_sse(_send(client, thread_id, "Why is that needed?").text)
    assert events[0] == ("status", {"stage": "rewriting"})
    assert events[1] == ("status", {"stage": "searching"})
    assert events[-1][1]["standalone_query"] == QUESTION

    messages = client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"]
    follow_up = messages[2]
    assert follow_up["content"] == "Why is that needed?"
    assert follow_up["standalone_query"] == QUESTION and follow_up["rewrite_used"] is True
    assert messages[0]["standalone_query"] is None  # first message was searched as typed


def test_rewrite_failure_falls_back_and_still_answers(chat, fake_groq, db) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["First [1]."])
    _send(client, thread_id)
    fake_groq.replies.append(LLMUnavailableError("busy"))
    fake_groq.stream_replies.append(["Second [1]."])
    events = parse_sse(_send(client, thread_id, QUESTION + " again").text)
    assert events[-1][0] == "done" and events[-1][1]["abstained"] is False
    follow_up = db.scalars(
        select(ChatMessage).where(ChatMessage.role == "user").order_by(ChatMessage.created_at)
    ).all()[1]
    assert follow_up.rewrite_fallback is True and follow_up.rewrite_used is False


def test_unrelated_question_abstains_without_a_generation_call(chat, fake_groq) -> None:
    client, thread_id = chat
    events = parse_sse(_send(client, thread_id, "Who won the football championship in 1990?").text)
    assert names(events) == ["status", "sources", "done"]
    assert events[1][1] == []
    assert events[-1][1]["abstained"] is True
    assert fake_groq.stream_calls == []
    answer = client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][1]
    assert answer["abstained"] is True and answer["citations"] == []
    assert answer["content"].startswith("I could not find")


def test_model_can_decline_with_the_not_found_marker(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["NOT_", "FOUND"])
    events = parse_sse(_send(client, thread_id).text)
    assert "token" not in names(events)
    assert events[-1][0] == "done" and events[-1][1]["abstained"] is True
    answer = client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][1]
    assert answer["abstained"] is True and answer["citations"] == []


def test_unknown_markers_are_flagged_and_citations_equal_the_retrieved_chunks(
    chat, fake_groq
) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["It is a method [1] and also [4]."])
    events = parse_sse(_send(client, thread_id).text)
    assert events[-1][1]["unknown_markers"] == [4]
    answer = client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][1]
    assert [c["marker"] for c in answer["citations"]] == [1]


def test_markers_in_full_width_brackets_and_lists_are_checked_too(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["A method【1】, see also [1, 7] and 【9】."])
    events = parse_sse(_send(client, thread_id).text)
    assert events[-1][1]["unknown_markers"] == [7, 9]


def test_provider_failure_mid_answer_sends_the_safe_error_and_keeps_the_partial(
    chat, fake_groq
) -> None:
    client, thread_id = chat
    busy = "The AI service is busy right now. Please try again in a moment"
    fake_groq.stream_replies.append(["Partial ", LLMUnavailableError(busy)])
    events = parse_sse(_send(client, thread_id).text)
    assert events[-1] == ("error", {"code": "provider_unavailable", "message": busy})
    answer = client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][1]
    assert (answer["status"], answer["content"]) == ("failed", "Partial ")


def test_unexpected_failure_is_reported_without_internal_details(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["Partial ", RuntimeError("password=hunter2 in stack")])
    events = parse_sse(_send(client, thread_id).text)
    assert events[-1][0] == "error" and events[-1][1]["code"] == "internal_error"
    assert "hunter2" not in json.dumps(events)
    answer = client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][1]
    assert answer["status"] == "failed"


def test_provider_failure_before_any_token_is_an_error_event(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(LLMUnavailableError("busy"))
    events = parse_sse(_send(client, thread_id).text)
    assert names(events)[-1] == "error" and "token" not in names(events)


def test_closing_the_stream_saves_a_stopped_partial_and_closes_groq(db, fake_groq) -> None:
    import tempfile
    from pathlib import Path

    from app.services import chat_stream_service
    from app.tests.helpers import FakeEmbedder, add_document, make_user

    user = make_user(db, "stopper@example.com", is_admin=False)
    add_document(db, user, "Notes", [RECURSION], Path(tempfile.mkdtemp()))
    thread = chat_stream_service.chat_service.create_thread(db, user.id)
    prepared = chat_stream_service.prepare_message(db, user.id, thread.id, QUESTION, None)

    fake_groq.stream_replies.append(["Recursion ", "is ", "a method"])
    stream = chat_stream_service.run_stream(db, FakeEmbedder(), fake_groq, prepared)
    for name, _data in stream:
        if name == "token":
            break  # the student pressed Stop
    stream.close()

    assert fake_groq.stream_closed is True  # we stopped reading from Groq
    saved = db.scalars(
        select(ChatMessage).where(
            ChatMessage.role == "assistant", ChatMessage.thread_id == thread.id
        )
    ).one()
    assert saved.status == "stopped" and saved.content == "Recursion "
    assert [c.marker for c in saved.citations] == [1]


@pytest.mark.anyio
async def test_a_client_disconnect_closes_the_underlying_stream(db, fake_groq) -> None:
    from app.api.routes.tutor import sse_stream

    closed = []

    def events():
        try:
            yield ("status", {"stage": "searching"})
            yield ("token", {"text": "x"})
            yield ("token", {"text": "y"})
        finally:
            closed.append(True)

    stream = sse_stream(events())
    first = await anext(stream)
    assert first.startswith(b"event: status")
    await stream.aclose()  # what Starlette does when the client goes away
    assert closed == [True]


def test_another_users_thread_and_documents_are_404_and_no_message_is_saved(
    client_factory, fake_groq, db
) -> None:
    alice, bob = client_factory(), client_factory()
    register(alice, "alice@example.com")
    register(bob, "bob@example.com")
    document = upload(alice, [RECURSION]).json()
    thread_id = _thread(alice)
    assert _send(bob, thread_id).status_code == 404
    own_thread = _thread(bob)
    assert _send(bob, own_thread, document_ids=[document["id"]]).status_code == 404
    assert _send(bob, str(uuid.uuid4())).status_code == 404
    assert db.scalars(select(ChatMessage)).all() == []
    assert fake_groq.stream_calls == [] and fake_groq.calls == []


def test_a_one_character_question_is_rejected_before_streaming(chat, fake_groq) -> None:
    client, thread_id = chat
    assert _send(client, thread_id, "?").status_code == 422
    assert fake_groq.stream_calls == []


def test_a_two_letter_question_is_accepted(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["Hello [1]."])
    assert _send(client, thread_id, "hi").status_code == 200


def test_snippets_end_at_a_word_boundary_with_an_ellipsis() -> None:
    from app.services.chat_stream_service import SNIPPET_CHARS, make_snippet

    assert make_snippet("A short  passage\nwith   spaces.") == "A short passage with spaces."
    long_text = "word " * 100
    snippet = make_snippet(long_text)
    assert snippet.endswith("…") and snippet[:-1].endswith("word")
    assert len(snippet) <= SNIPPET_CHARS + 1
    assert make_snippet("x" * 500).endswith("…")  # no spaces at all: still cut


def test_mode_changes_the_answer_instruction_but_saves_the_question_as_typed(
    chat, fake_groq
) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["Q1 [1]."])
    response = _send(client, thread_id, mode="quiz")
    assert response.status_code == 200

    call = fake_groq.stream_calls[0]
    assert "How to answer:" in call["user"] and "multiple-choice" in call["user"]
    assert QUESTION in call["user"]
    saved = client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][0]
    assert saved["content"] == QUESTION  # the instruction is never stored or shown back


def test_ask_mode_adds_no_instruction(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["Answer [1]."])
    _send(client, thread_id)
    assert "How to answer:" not in fake_groq.stream_calls[0]["user"]


def test_unknown_mode_is_rejected(chat) -> None:
    client, thread_id = chat
    assert _send(client, thread_id, mode="hack").status_code == 422


# Broad requests: no single passage matches "all topics", but the material is there


def test_quiz_on_all_topics_samples_the_material_instead_of_saying_not_found(
    chat, fake_groq
) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["1. What stops recursion? [1]"])
    response = _send(client, thread_id, "quiz me all topic maximum 10 quiz", mode="quiz")
    events = parse_sse(response.text)

    assert "token" in names(events)
    done = events[-1][1]
    assert done["abstained"] is False
    call = fake_groq.stream_calls[0]
    assert "<passages>" in call["user"] and "Recursion is a method" in call["user"]
    assert "exactly 10 multiple-choice questions" in call["user"]  # the number asked for


def test_the_number_of_questions_is_capped_and_defaults_to_five(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["Q [1]"])
    _send(client, thread_id, "quiz me on everything with 50 questions", mode="quiz")
    assert "exactly 10 multiple-choice" in fake_groq.stream_calls[0]["user"]

    fake_groq.replies.append(
        {"standalone_question": "quiz me on everything"}
    )  # the follow-up rewrite
    fake_groq.stream_replies.append(["Q [1]"])
    _send(client, thread_id, "quiz me on everything", mode="quiz")
    assert "exactly 5 multiple-choice" in fake_groq.stream_calls[1]["user"]


def test_naming_a_document_covers_that_document(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["It is the base case [1]."])
    _send(client, thread_id, "Explain the hardest topic in Notes simply", mode="simple")
    call = fake_groq.stream_calls[0]
    assert "<passages>" in call["user"]
    assert "sample from across the student's material" in call["user"] or "beginner" in call["user"]


def test_a_specific_topic_the_material_does_not_cover_still_says_not_found(chat, fake_groq) -> None:
    client, thread_id = chat
    response = _send(client, thread_id, "quiz me on quantum chromodynamics", mode="quiz")
    done = parse_sse(response.text)[-1][1]
    assert done["abstained"] is True
    assert fake_groq.stream_calls == []  # nothing was sent to the model


def test_a_broad_question_outside_the_selected_documents_stays_inside_the_selection(
    auth_client, fake_groq
) -> None:
    upload(auth_client, [RECURSION], title="Recursion Notes")
    other = upload(
        auth_client,
        ["Photosynthesis converts light into chemical energy in plants."],
        title="Biology",
    )
    thread_id = _thread(auth_client)
    fake_groq.stream_replies.append(["Plants [1]."])
    _send(
        auth_client,
        thread_id,
        "quiz me on everything",
        mode="quiz",
        document_ids=[other.json()["id"]],
    )
    prompt = fake_groq.stream_calls[0]["user"]
    assert "Photosynthesis" in prompt and "Recursion is a method" not in prompt


# Small talk is answered, not searched for or refused


def test_hi_gets_a_greeting_not_a_not_found(chat, fake_groq, db) -> None:
    client, thread_id = chat
    events = parse_sse(_send(client, thread_id, "hi").text)

    assert names(events) == ["sources", "token", "done"]
    assert "Hi! I'm your study tutor" in events[1][1]["text"] and "Notes" in events[1][1]["text"]
    assert events[-1][1]["abstained"] is False
    assert fake_groq.stream_calls == [] and fake_groq.calls == []  # no model call, no search
    saved = client.get(f"/api/v1/tutor/threads/{thread_id}").json()["messages"][1]
    assert saved["abstained"] is False and saved["citations"] == []


def test_a_greeting_inside_a_real_question_is_still_searched(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["It stops at the base case [1]."])
    events = parse_sse(_send(client, thread_id, "hi, " + QUESTION).text)
    assert "status" in names(events) and fake_groq.stream_calls


# "give me in bullets": the same question again, answered in a new form


def test_a_formatting_follow_up_searches_for_the_previous_question_not_its_own_words(
    chat, fake_groq
) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["A function calls itself [1]."])
    _send(client, thread_id)

    fake_groq.stream_replies.append(
        ["- It calls itself [1]"]
    )  # no rewrite reply is queued: none is needed
    events = parse_sse(_send(client, thread_id, "give me in bullets posint").text)

    assert events[-1][1]["abstained"] is False and "token" in names(events)
    call = fake_groq.stream_calls[1]
    assert QUESTION in call["user"] and "bulleted list" in call["user"]
    assert "posint" not in call["user"]
    assert fake_groq.calls == []  # the rewrite model was not called either

    thread = client.get(f"/api/v1/tutor/threads/{thread_id}").json()
    follow_up = [m for m in thread["messages"] if m["role"] == "user"][1]
    assert follow_up["content"] == "give me in bullets posint"  # saved as typed
    assert follow_up["standalone_query"] == QUESTION and follow_up["rewrite_used"] is True


def test_a_formatting_request_as_the_first_message_has_nothing_to_reformat(chat, fake_groq) -> None:
    client, thread_id = chat
    events = parse_sse(_send(client, thread_id, "in bullets").text)
    assert events[-1][1]["abstained"] is True  # no previous answer to work from
    assert fake_groq.stream_calls == []


def test_a_real_question_after_an_answer_is_not_treated_as_formatting(chat, fake_groq) -> None:
    client, thread_id = chat
    fake_groq.stream_replies.append(["First [1]."])
    _send(client, thread_id)
    fake_groq.replies.append({"standalone_question": "What is a base case?"})
    fake_groq.stream_replies.append(["A base case stops recursion [1]."])
    _send(client, thread_id, "what is a base case?")
    assert "bulleted list" not in fake_groq.stream_calls[1]["user"]
    assert len(fake_groq.calls) == 1  # the normal follow-up rewrite ran
