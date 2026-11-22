import json
import logging
import re
import time
from collections.abc import Iterator
from functools import lru_cache
from typing import Any

import groq

from app.core.config import get_settings

logger = logging.getLogger("app.groq")


class LLMUnavailableError(Exception):
    """The language model could not be reached or is not configured. Safe to show to users."""


class LLMOutputError(Exception):
    """The model replied, but not with usable structured output."""


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise LLMOutputError("The model did not return JSON") from None
        try:
            data = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError:
            raise LLMOutputError("The model returned malformed JSON") from None
    if not isinstance(data, dict):
        raise LLMOutputError("The model returned an unexpected JSON shape")
    return data


def _unavailable(exc: groq.GroqError) -> LLMUnavailableError:
    """Map a provider error to a safe message. Provider details are logged, never shown."""
    if isinstance(exc, groq.RateLimitError):
        logger.warning("Groq rate limited")
        return LLMUnavailableError("The AI service is busy right now. Please try again in a moment")
    if isinstance(exc, groq.APIConnectionError | groq.APITimeoutError | groq.InternalServerError):
        logger.warning("Groq unreachable: %s", type(exc).__name__)
        return LLMUnavailableError(
            "The AI service is temporarily unavailable. Please try again shortly"
        )
    if isinstance(exc, groq.APIStatusError):
        logger.error("Groq returned status %s", exc.status_code)
    else:
        logger.error("Groq error: %s", type(exc).__name__)
    return LLMUnavailableError("The AI service could not process the request")


class GroqService:
    """The only place that talks to Groq. Retries on transient errors are bounded and handled
    by the official SDK (`max_retries`)."""

    def __init__(self, client: groq.Groq | None, model: str, reasoning_effort: str = "") -> None:
        self._client = client
        self._model = model
        self._reasoning_effort = reasoning_effort

    @property
    def model_name(self) -> str:
        return self._model

    def _extra(self) -> dict[str, Any]:
        return {"reasoning_effort": self._reasoning_effort} if self._reasoning_effort else {}

    def stream_text(
        self, system: str, user: str, *, temperature: float, max_tokens: int
    ) -> Iterator[str]:
        """Yield the answer as plain-text pieces. Closing the generator closes the provider
        stream, so a student pressing Stop also stops the model from generating."""
        if self._client is None or not self._model:
            raise LLMUnavailableError("The AI service is not configured yet")
        started = time.perf_counter()
        stream = None
        try:
            stream = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
                **self._extra(),
            )
            for chunk in stream:
                piece = chunk.choices[0].delta.content if chunk.choices else None
                if piece:
                    yield piece
        except groq.GroqError as exc:
            raise _unavailable(exc) from exc
        finally:
            if stream is not None:
                stream.close()
            logger.info("Groq stream finished in %.0fms", (time.perf_counter() - started) * 1000)

    def complete_json(
        self, system: str, user: str, *, temperature: float, max_tokens: int
    ) -> dict[str, Any]:
        if self._client is None or not self._model:
            raise LLMUnavailableError("The AI service is not configured yet")
        started = time.perf_counter()
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
                **self._extra(),
            )
        except groq.GroqError as exc:
            raise _unavailable(exc) from exc
        finally:
            logger.info("Groq call finished in %.0fms", (time.perf_counter() - started) * 1000)

        content = response.choices[0].message.content or ""
        return _extract_json(content)

    def transcribe_audio(
        self,
        file_bytes: bytes,
        filename: str = "audio.webm",
        model: str = "whisper-large-v3",
    ) -> str:
        if self._client is None:
            raise LLMUnavailableError("The AI service is not configured yet")
        started = time.perf_counter()
        try:
            transcription = self._client.audio.transcriptions.create(
                file=(filename, file_bytes),
                model=model,
            )
            return str(getattr(transcription, "text", "")).strip()
        except groq.GroqError as exc:
            raise _unavailable(exc) from exc
        finally:
            logger.info(
                "Groq transcription finished in %.0fms", (time.perf_counter() - started) * 1000
            )


@lru_cache
def get_groq_service() -> GroqService:
    settings = get_settings()
    client = (
        groq.Groq(
            api_key=settings.groq_api_key,
            timeout=settings.groq_timeout_seconds,
            max_retries=settings.groq_max_retries,
        )
        if settings.groq_api_key
        else None
    )
    return GroqService(client, settings.groq_model, settings.groq_reasoning_effort)
