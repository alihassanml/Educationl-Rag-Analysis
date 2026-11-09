import json
import logging
import re
import time
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


class GroqService:
    """The only place that talks to Groq. Retries on transient errors are bounded and handled
    by the official SDK (`max_retries`)."""

    def __init__(self, client: groq.Groq | None, model: str, reasoning_effort: str = "") -> None:
        self._client = client
        self._model = model
        self._reasoning_effort = reasoning_effort

    def complete_json(
        self, system: str, user: str, *, temperature: float, max_tokens: int
    ) -> dict[str, Any]:
        if self._client is None or not self._model:
            raise LLMUnavailableError("The AI service is not configured yet")
        started = time.perf_counter()
        extra: dict[str, Any] = (
            {"reasoning_effort": self._reasoning_effort} if self._reasoning_effort else {}
        )
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
                **extra,
            )
        except groq.RateLimitError as exc:
            logger.warning("Groq rate limited")
            raise LLMUnavailableError(
                "The AI service is busy right now. Please try again in a moment"
            ) from exc
        except (groq.APIConnectionError, groq.APITimeoutError, groq.InternalServerError) as exc:
            logger.warning("Groq unreachable: %s", type(exc).__name__)
            raise LLMUnavailableError(
                "The AI service is temporarily unavailable. Please try again shortly"
            ) from exc
        except groq.APIStatusError as exc:
            logger.error("Groq returned status %s", exc.status_code)
            raise LLMUnavailableError("The AI service could not process the request") from exc
        finally:
            logger.info("Groq call finished in %.0fms", (time.perf_counter() - started) * 1000)

        content = response.choices[0].message.content or ""
        return _extract_json(content)


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
