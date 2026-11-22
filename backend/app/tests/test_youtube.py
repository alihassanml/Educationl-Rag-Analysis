import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models.document import Document, DocumentChunk
from app.services import youtube_service
from app.services.youtube_service import Snippet, format_timestamp, parse_video_id
from app.tests.conftest import register

VIDEO = "dQw4w9WgXcQ"


# --- links and times


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VIDEO}",
        f"https://youtube.com/watch?v={VIDEO}&t=42s",
        f"https://m.youtube.com/watch?v={VIDEO}",
        f"https://youtu.be/{VIDEO}",
        f"https://youtu.be/{VIDEO}?t=10",
        f"https://www.youtube.com/shorts/{VIDEO}",
        f"http://www.youtube.com/embed/{VIDEO}",
    ],
)
def test_accepted_links(url: str) -> None:
    assert parse_video_id(url) == VIDEO


@pytest.mark.parametrize(
    "url",
    [
        "https://www.youtube.com/watch?v=short",
        "https://www.youtube.com/watch",
        "https://www.youtube.com/playlist?list=PL123",
        "https://vimeo.com/123456789",
        "https://evil.com/watch?v=" + VIDEO,
        "https://youtube.com.evil.com/watch?v=" + VIDEO,
        "ftp://youtu.be/" + VIDEO,
        "not a link",
        "",
    ],
)
def test_rejected_links(url: str) -> None:
    assert parse_video_id(url) is None


def test_timestamps_and_links() -> None:
    assert format_timestamp(754) == "12:34"
    assert format_timestamp(5) == "0:05"
    assert format_timestamp(3725) == "1:02:05"
    assert youtube_service.link_at("https://youtu.be/x", 754) == "https://youtu.be/x?t=754"
    assert youtube_service.link_at("https://youtu.be/x", None) == "https://youtu.be/x"


def test_captions_are_grouped_into_timed_windows_and_survive_storage() -> None:
    snippets = [Snippet(i * 4, " ".join(f"word{i}x{j}" for j in range(8))) for i in range(40)]
    pages = youtube_service.windows(snippets)
    assert len(pages) >= 2
    assert pages[0].start_seconds == 0 and pages[1].start_seconds > 0
    assert all(p.page_number is None for p in pages)
    assert youtube_service.from_stored(youtube_service.to_stored(snippets)) == snippets


# --- adding a video


def _captions(count: int = 60) -> list[Snippet]:
    words = "recursion calls itself on a smaller input until a base case stops it".split()
    return [Snippet(i * 5, " ".join(words) + f" part {i}") for i in range(count)]


@pytest.fixture
def captions(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(youtube_service, "fetch_transcript", lambda video_id: _captions())
    monkeypatch.setattr(youtube_service, "video_title", lambda video_id: "Recursion lecture")


def test_a_video_with_captions_becomes_a_ready_lecture(auth_client, db, captions) -> None:  # type: ignore[no-untyped-def]
    response = auth_client.post(
        "/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}"}
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["status"], body["kind"], body["source_type"]) == ("ready", "lecture", "youtube")
    assert (
        body["title"] == "Recursion lecture" and body["source_url"] == f"https://youtu.be/{VIDEO}"
    )
    document = db.get(Document, body["id"])
    assert document.mime_type == "video/youtube"
    starts = [
        c.start_seconds
        for c in db.scalars(select(DocumentChunk).order_by(DocumentChunk.chunk_index))
    ]
    assert starts[0] == 0 and starts == sorted(starts) and len(set(starts)) > 1


def test_the_title_can_be_given_and_falls_back_to_the_video_id(
    auth_client, monkeypatch, captions
) -> None:  # type: ignore[no-untyped-def]
    named = auth_client.post(
        "/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}", "title": "Week 4"}
    )
    assert named.json()["title"] == "Week 4"
    monkeypatch.setattr(youtube_service, "video_title", lambda video_id: None)
    plain = auth_client.post("/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}"})
    assert plain.json()["title"] == f"YouTube lecture {VIDEO}"


def test_citations_open_the_video_at_the_right_second(auth_client, fake_groq, captions) -> None:  # type: ignore[no-untyped-def]
    auth_client.post("/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}"})
    fake_groq.replies.append(
        {
            "answer": "A function calling itself.",
            "insufficient_evidence": False,
            "used_passages": [1],
        }
    )
    answer = auth_client.post(
        "/api/v1/tutor/ask", json={"question": "What is recursion and a base case?"}
    ).json()
    citation = answer["citations"][0]
    assert citation["document_title"] == "Recursion lecture"
    assert citation["start_seconds"] is not None
    assert citation["source_url"] == f"https://youtu.be/{VIDEO}?t={citation['start_seconds']}"
    assert citation["page_number"] is None


def test_streamed_chat_sources_carry_the_timestamp_and_link(
    auth_client, fake_groq, captions
) -> None:  # type: ignore[no-untyped-def]
    from app.tests.test_chat_stream import _send, _thread, parse_sse

    auth_client.post("/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}"})
    thread = _thread(auth_client)
    fake_groq.stream_replies.append(["A function calls itself [1]."])
    events = parse_sse(_send(auth_client, thread, "What is recursion and a base case?").text)
    source = next(data for name, data in events if name == "sources")[0]
    assert source["start_seconds"] is not None
    assert source["source_url"].startswith(f"https://youtu.be/{VIDEO}?t=")
    saved = auth_client.get(f"/api/v1/tutor/threads/{thread}").json()["messages"][-1]["citations"][
        0
    ]
    assert saved["source_url"] == source["source_url"]


def test_reindexing_a_lecture_keeps_its_timestamps(auth_client, db, captions) -> None:  # type: ignore[no-untyped-def]
    from app.services import document_service
    from app.tests.conftest import FakeEmbedder

    body = auth_client.post(
        "/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}"}
    ).json()
    document = db.get(Document, body["id"])
    before = [
        c.start_seconds
        for c in db.scalars(select(DocumentChunk).order_by(DocumentChunk.chunk_index))
    ]
    document_service.reindex(db, FakeEmbedder(), document)
    after = [
        c.start_seconds
        for c in db.scalars(select(DocumentChunk).order_by(DocumentChunk.chunk_index))
    ]
    assert after == before and document.status == "ready"


def test_a_video_without_captions_offers_the_paste_option(auth_client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def refuse(video_id: str):  # type: ignore[no-untyped-def]
        raise AppError(422, "no_transcript", youtube_service.NO_TRANSCRIPT_MESSAGE)

    monkeypatch.setattr(youtube_service, "fetch_transcript", refuse)
    response = auth_client.post(
        "/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}"}
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "no_transcript" and "Paste the transcript" in error["message"]
    assert auth_client.get("/api/v1/documents").json()["total"] == 0


def test_a_blocked_or_failing_library_is_the_same_clear_error(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import youtube_transcript_api

    class Blocked:
        def fetch(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            raise youtube_transcript_api.RequestBlocked("x")

        def list(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            return []

    monkeypatch.setattr(youtube_transcript_api, "YouTubeTranscriptApi", Blocked)
    with pytest.raises(AppError) as caught:
        youtube_service.fetch_transcript(VIDEO)
    assert caught.value.code == "no_transcript"


def test_a_link_that_is_not_a_video_is_rejected_before_any_fetch(auth_client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def boom(video_id: str):  # type: ignore[no-untyped-def]
        raise AssertionError("must not be called")

    monkeypatch.setattr(youtube_service, "fetch_transcript", boom)
    response = auth_client.post("/api/v1/documents/youtube", json={"url": "https://vimeo.com/123"})
    assert response.status_code == 422 and response.json()["error"]["code"] == "invalid_youtube_url"


def test_a_lecture_belongs_to_one_student(client_factory, captions) -> None:  # type: ignore[no-untyped-def]
    a, b = client_factory(), client_factory()
    register(a, "a@example.com")
    doc = a.post("/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}"}).json()
    register(b, "b@example.com")
    assert b.get(f"/api/v1/documents/{doc['id']}").status_code == 404
    assert b.get("/api/v1/documents").json()["total"] == 0


def test_youtube_needs_signing_in(client) -> None:  # type: ignore[no-untyped-def]
    assert (
        client.post(
            "/api/v1/documents/youtube", json={"url": f"https://youtu.be/{VIDEO}"}
        ).status_code
        == 401
    )
