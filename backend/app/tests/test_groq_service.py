import groq
import httpx
import pytest

from app.services.groq_service import (
    GroqService,
    LLMOutputError,
    LLMUnavailableError,
    _extract_json,
)


class _Completions:
    def __init__(self, result) -> None:  # type: ignore[no-untyped-def]
        self.result = result

    def create(self, **_kwargs):  # type: ignore[no-untyped-def]
        if isinstance(self.result, Exception):
            raise self.result
        message = type("M", (), {"content": self.result})
        return type("R", (), {"choices": [type("C", (), {"message": message})]})


def _service(result) -> GroqService:  # type: ignore[no-untyped-def]
    client = type("Client", (), {"chat": type("Chat", (), {"completions": _Completions(result)})})
    return GroqService(client, "some-model")  # type: ignore[arg-type]


def _call(service: GroqService) -> dict:
    return service.complete_json("s", "u", temperature=0.1, max_tokens=10)


def test_unconfigured_service_reports_unavailable() -> None:
    with pytest.raises(LLMUnavailableError):
        _call(GroqService(None, ""))


def test_parses_plain_and_fenced_json() -> None:
    assert _call(_service('{"a": 1}')) == {"a": 1}
    assert _extract_json('```json\n{"a": 2}\n```') == {"a": 2}
    assert _extract_json('Sure! {"a": 3} hope that helps') == {"a": 3}


@pytest.mark.parametrize("bad", ["not json", "[1, 2]", "{broken", ""])
def test_malformed_output_raises_output_error(bad: str) -> None:
    with pytest.raises(LLMOutputError):
        _call(_service(bad))


def test_provider_errors_become_safe_unavailable_errors() -> None:
    request = httpx.Request("POST", "https://api.groq.com")
    rate_limit = groq.RateLimitError(
        "secret detail", response=httpx.Response(429, request=request), body=None
    )
    with pytest.raises(LLMUnavailableError) as info:
        _call(_service(rate_limit))
    assert "secret" not in str(info.value)
    with pytest.raises(LLMUnavailableError):
        _call(_service(groq.APIConnectionError(request=request)))


class _FakeStream:
    def __init__(self, pieces, error=None) -> None:  # type: ignore[no-untyped-def]
        self.pieces, self.error, self.closed = pieces, error, False

    def __iter__(self):  # type: ignore[no-untyped-def]
        for piece in self.pieces:
            delta = type("D", (), {"content": piece})
            yield type("Chunk", (), {"choices": [type("C", (), {"delta": delta})]})
        if self.error:
            raise self.error

    def close(self) -> None:
        self.closed = True


def _streaming_service(stream, seen=None):  # type: ignore[no-untyped-def]
    class Completions:
        def create(self, **kwargs):  # type: ignore[no-untyped-def]
            if seen is not None:
                seen.update(kwargs)
            if isinstance(stream, Exception):
                raise stream
            return stream

    client = type("Client", (), {"chat": type("Chat", (), {"completions": Completions()})})
    return GroqService(client, "some-model")  # type: ignore[arg-type]


def test_stream_text_yields_non_empty_pieces_and_closes_the_stream() -> None:
    stream, seen = _FakeStream(["Hel", None, "", "lo"]), {}
    service = _streaming_service(stream, seen)
    assert list(service.stream_text("s", "u", temperature=0.2, max_tokens=10)) == ["Hel", "lo"]
    assert seen["stream"] is True and "response_format" not in seen
    assert stream.closed is True


def test_stream_text_stops_reading_when_the_consumer_closes_it() -> None:
    stream = _FakeStream(["a", "b", "c"])
    generator = _streaming_service(stream).stream_text("s", "u", temperature=0.2, max_tokens=10)
    assert next(generator) == "a"
    generator.close()
    assert stream.closed is True


def test_stream_text_errors_become_safe_unavailable_errors() -> None:
    request = httpx.Request("POST", "https://api.groq.com")
    limited = groq.RateLimitError(
        "secret detail", response=httpx.Response(429, request=request), body=None
    )
    with pytest.raises(LLMUnavailableError) as info:
        list(_streaming_service(limited).stream_text("s", "u", temperature=0.2, max_tokens=10))
    assert "secret" not in str(info.value)
    dropped = _FakeStream(["a"], error=groq.APIConnectionError(request=request))
    with pytest.raises(LLMUnavailableError):
        list(_streaming_service(dropped).stream_text("s", "u", temperature=0.2, max_tokens=10))
    with pytest.raises(LLMUnavailableError):
        list(GroqService(None, "").stream_text("s", "u", temperature=0.2, max_tokens=10))
