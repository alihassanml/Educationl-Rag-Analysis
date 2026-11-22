"""YouTube lectures as study material: read the video link, fetch the captions, and cut them into
timed windows so a citation can open the video at the right second."""

import logging
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

import httpx

from app.core.errors import AppError
from app.services.pdf_service import PageText

logger = logging.getLogger("app.youtube")

_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}
_SHORT_HOST = "youtu.be"
# Captions are grouped into windows of about this many words, so each passage starts at a time
WINDOW_WORDS = 110
_ENGLISH = ("en", "en-US", "en-GB")
_OEMBED = "https://www.youtube.com/oembed"

NO_TRANSCRIPT_MESSAGE = (
    "No transcript could be read for this video: captions may be turned off, or YouTube "
    "refused the request. Paste the transcript as text instead."
)


@dataclass(frozen=True)
class Snippet:
    start: int  # seconds from the start of the video
    text: str


def parse_video_id(url: str) -> str | None:
    """The video id of a watch, youtu.be or shorts link, or None for anything else."""
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https"):
        return None
    host = (parsed.hostname or "").lower()
    candidate: str | None = None
    if host == _SHORT_HOST:
        candidate = parsed.path.strip("/").split("/")[0]
    elif host in _HOSTS:
        parts = [p for p in parsed.path.split("/") if p]
        if parsed.path.rstrip("/") == "/watch":
            candidate = (parse_qs(parsed.query).get("v") or [""])[0]
        elif len(parts) == 2 and parts[0] in ("shorts", "embed", "live"):
            candidate = parts[1]
    return candidate if candidate and _VIDEO_ID.match(candidate) else None


def canonical_url(video_id: str) -> str:
    return f"https://youtu.be/{video_id}"


def link_at(base: str, seconds: int | None) -> str:
    """The video link that starts at a given second."""
    return f"{base}?t={seconds}" if seconds is not None else base


def format_timestamp(seconds: int) -> str:
    hours, rest = divmod(max(seconds, 0), 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def fetch_transcript(video_id: str) -> list[Snippet]:
    """Captions of the video: English when there is any (written by hand, else automatic), else
    the first language there is. Raises AppError(422) when none can be read."""
    from youtube_transcript_api import (  # imported here so the rest of the app never needs it
        CouldNotRetrieveTranscript,
        YouTubeTranscriptApi,
    )

    api = YouTubeTranscriptApi()
    try:
        try:
            fetched = api.fetch(video_id, languages=_ENGLISH)
        except CouldNotRetrieveTranscript:
            available = list(api.list(video_id))
            if not available:
                raise
            fetched = available[0].fetch()
    except Exception as exc:  # the library has many failure types, and so does the network
        logger.info("No transcript for %s: %s", video_id, type(exc).__name__)
        raise AppError(422, "no_transcript", NO_TRANSCRIPT_MESSAGE) from exc
    snippets = [
        Snippet(int(s.start), " ".join(s.text.split()))
        for s in fetched
        if s.text and s.text.strip()
    ]
    if not snippets:
        raise AppError(422, "no_transcript", NO_TRANSCRIPT_MESSAGE)
    return snippets


def video_title(video_id: str) -> str | None:
    """The video's title from YouTube's public oEmbed endpoint, or None if it cannot be read."""
    try:
        response = httpx.get(
            _OEMBED, params={"url": canonical_url(video_id), "format": "json"}, timeout=5.0
        )
        title = response.json().get("title") if response.status_code == 200 else None
        return " ".join(title.split())[:255] if isinstance(title, str) and title.strip() else None
    except (httpx.HTTPError, ValueError):
        return None


def windows(snippets: list[Snippet]) -> list[PageText]:
    """Group captions into passages of about WINDOW_WORDS words, each starting at a time."""
    result: list[PageText] = []
    words: list[str] = []
    start = 0
    for snippet in snippets:
        if not words:
            start = snippet.start
        words.extend(snippet.text.split())
        if len(words) >= WINDOW_WORDS:
            result.append(PageText(page_number=None, text=" ".join(words), start_seconds=start))
            words = []
    if words:
        result.append(PageText(page_number=None, text=" ".join(words), start_seconds=start))
    return result


def to_stored(snippets: list[Snippet]) -> str:
    """The transcript as saved on disk: one caption per line, as "seconds<TAB>text"."""
    return "\n".join(f"{s.start}\t{s.text}" for s in snippets)


def from_stored(text: str) -> list[Snippet]:
    snippets = []
    for line in text.splitlines():
        seconds, _, caption = line.partition("\t")
        if seconds.isdigit() and caption.strip():
            snippets.append(Snippet(int(seconds), caption.strip()))
    return snippets
