"""Text sources other than PDFs: a public web page, or text the student pastes in."""

import ipaddress
import re
import socket
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Literal
from urllib.parse import unquote, urljoin, urlparse

import httpx

from app.core.config import get_settings
from app.core.errors import AppError

MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
FETCH_TIMEOUT_SECONDS = 10.0
MAX_TEXT_CHARS = 200_000
MIN_TEXT_CHARS = 30

_USER_AGENT = "EduRAG-reader/1.0"
_SKIPPED_TAGS = {
    "script", "style", "noscript", "template", "svg", "iframe", "nav", "header", "footer",
    "aside", "form", "button", "select", "dialog",
}  # fmt: skip
_BLOCK_TAGS = {
    "p", "div", "section", "article", "main", "li", "ul", "ol", "br", "tr", "table", "blockquote",
    "pre", "h1", "h2", "h3", "h4", "h5", "h6",
}  # fmt: skip


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self._skip_depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:  # type: ignore[no-untyped-def]
        if tag in _SKIPPED_TAGS:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIPPED_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in _BLOCK_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data
        elif not self._skip_depth:
            self._parts.append(data)

    def text(self) -> str:
        joined = "".join(self._parts)
        lines = (re.sub(r"[ \t ]+", " ", line).strip() for line in joined.split("\n"))
        return "\n".join(line for line in lines if line)


def html_to_text(html: str) -> tuple[str, str]:
    """Return (page title, readable text). Menus, scripts and footers are dropped."""
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    return re.sub(r"\s+", " ", parser.title).strip(), parser.text()


def _resolve_ips(host: str) -> list[str]:
    try:
        return sorted({info[4][0] for info in socket.getaddrinfo(host, None)})
    except socket.gaierror as exc:
        raise AppError(400, "invalid_url", "That address could not be found") from exc


def assert_public_url(url: str) -> None:
    """Only http(s) addresses that point at the public internet. This keeps the server from being
    used to read localhost, the private network or cloud metadata services."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise AppError(
            400, "invalid_url", "Enter a web address that starts with http:// or https://"
        )
    if parsed.username or parsed.password:
        raise AppError(400, "invalid_url", "Remove the username and password from the address")
    for ip in _resolve_ips(parsed.hostname):
        if not ipaddress.ip_address(ip).is_global:
            raise AppError(400, "invalid_url", "That address is not a public website")


@dataclass(frozen=True)
class Fetched:
    """What a web address returned: a page of HTML, plain text, or a PDF file."""

    kind: Literal["html", "text", "pdf"]
    body: bytes
    encoding: str | None = None


_HTML_TYPES = ("text/html", "application/xhtml+xml")
_PDF_TYPES = ("application/pdf", "application/x-pdf")
_BINARY_TYPES = ("application/octet-stream", "binary/octet-stream")


def _classify(content_type: str, url: str) -> Literal["html", "text", "pdf"] | None:
    if content_type in _HTML_TYPES:
        return "html"
    if content_type == "text/plain":
        return "text"
    if content_type in _PDF_TYPES or (
        content_type in _BINARY_TYPES and urlparse(url).path.lower().endswith(".pdf")
    ):
        return "pdf"
    return None


def fetch(url: str, *, client: httpx.Client | None = None) -> Fetched:
    """Download one web address: a page, text, or a PDF. Redirects are followed by hand so every
    hop is checked; the download is capped in size and time (PDFs get the upload limit)."""
    own_client = client is None
    http = client or httpx.Client(timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=False)
    pdf_limit = get_settings().max_upload_mb * 1024 * 1024
    try:
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            assert_public_url(current)
            try:
                with http.stream(
                    "GET",
                    current,
                    headers={
                        "User-Agent": _USER_AGENT,
                        "Accept": "text/html,text/plain,application/pdf",
                    },
                ) as response:
                    if response.is_redirect and (location := response.headers.get("location")):
                        current = urljoin(current, location)
                        continue
                    if response.status_code >= 400:
                        raise AppError(
                            400,
                            "website_unavailable",
                            f"The website answered with error {response.status_code}",
                        )
                    content_type = (
                        response.headers.get("content-type", "").split(";")[0].strip().lower()
                    )
                    kind = _classify(content_type, current)
                    if kind is None:
                        raise AppError(
                            400,
                            "invalid_url",
                            "That address is not a web page or a PDF",
                        )
                    limit = pdf_limit if kind == "pdf" else MAX_PAGE_BYTES
                    body = bytearray()
                    for block in response.iter_bytes():
                        body.extend(block)
                        if len(body) > limit:
                            raise AppError(
                                413,
                                "page_too_large",
                                "That PDF is too large to add"
                                if kind == "pdf"
                                else "That page is too large to read",
                            )
                    if kind == "pdf" and not body.startswith(b"%PDF-"):
                        raise AppError(400, "invalid_url", "That link did not return a valid PDF")
                    return Fetched(kind, bytes(body), response.encoding)
            except httpx.HTTPError as exc:
                raise AppError(
                    400,
                    "website_unavailable",
                    "The website could not be reached. Check the address",
                ) from exc
        raise AppError(400, "website_unavailable", "The website redirected too many times")
    finally:
        if own_client:
            http.close()


def extract_text(fetched: Fetched) -> tuple[str, str]:
    """(title, readable text) of a fetched page or text file."""
    text = fetched.body.decode(fetched.encoding or "utf-8", errors="replace")
    if fetched.kind == "text":
        return "", text.strip()
    return html_to_text(text)


def fetch_page_text(url: str, *, client: httpx.Client | None = None) -> tuple[str, str]:
    """Download a web page and return (title, text). A PDF link is not a page."""
    fetched = fetch(url, client=client)
    if fetched.kind == "pdf":
        raise AppError(400, "invalid_url", "That address is a PDF, not a web page")
    return extract_text(fetched)


def filename_from_url(url: str) -> str:
    """A readable file name for a PDF link: the last part of its path, or the site name."""
    parsed = urlparse(url)
    tail = unquote(parsed.path.rstrip("/").rsplit("/", 1)[-1])
    name = tail or parsed.hostname or "document"
    return name if name.lower().endswith(".pdf") else f"{name}.pdf"


def title_from_url(url: str) -> str:
    parsed = urlparse(url)
    tail = parsed.path.rstrip("/").rsplit("/", 1)[-1]
    return (f"{parsed.hostname} {tail}".strip() if tail else parsed.hostname or "Website")[:255]
