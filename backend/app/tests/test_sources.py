import httpx
import pytest
from sqlalchemy import select

from app.core.errors import AppError
from app.models.document import Document, DocumentChunk
from app.services import source_service
from app.tests.conftest import make_pdf

NOTES = (
    "Recursion is a method where a function calls itself to solve smaller instances of a problem. "
    "Every recursive function needs a base case that stops the calls and a recursive case."
)
PAGE = f"""<html><head><title>  Recursion   guide </title><style>p{{color:red}}</style></head>
<body><nav>Home About Pricing</nav><script>var secret = 1;</script>
<main><h1>Recursion</h1><p>{NOTES}</p></main><footer>Copyright</footer></body></html>"""


@pytest.fixture
def public_dns(monkeypatch):  # type: ignore[no-untyped-def]
    """Resolve every name to a public address so no test touches the network."""
    monkeypatch.setattr(source_service, "_resolve_ips", lambda host: ["93.184.216.34"])


def _page(title: str = "Recursion guide", body: str = NOTES) -> source_service.Fetched:
    html = f"<html><head><title>{title}</title></head><body><p>{body}</p></body></html>"
    return source_service.Fetched("html", html.encode())


def _client(handler) -> httpx.Client:  # type: ignore[no-untyped-def]
    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)


# Pasted text


def test_pasted_text_is_indexed_and_marked_as_text(auth_client, db) -> None:
    response = auth_client.post("/api/v1/documents/text", json={"title": "My notes", "text": NOTES})
    assert response.status_code == 201
    body = response.json()
    assert (body["status"], body["title"], body["source_type"]) == ("ready", "My notes", "text")
    assert "mime_type" not in body
    chunks = db.scalars(select(DocumentChunk)).all()
    assert chunks and all(c.page_number is None for c in chunks)  # no pages to cite


def test_pasted_text_that_is_too_short_is_rejected(auth_client) -> None:
    response = auth_client.post("/api/v1/documents/text", json={"title": "Tiny", "text": "hi"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "text_too_short"


def test_pasted_text_over_the_limit_is_rejected(auth_client) -> None:
    text = "word " * (source_service.MAX_TEXT_CHARS // 5 + 10)
    response = auth_client.post("/api/v1/documents/text", json={"title": "Huge", "text": text})
    assert response.status_code == 413


def test_adding_text_needs_a_signed_in_student(client) -> None:
    assert (
        client.post("/api/v1/documents/text", json={"title": "x", "text": NOTES}).status_code == 401
    )


def test_deleting_a_text_document_removes_its_stored_file(auth_client, isolated_upload_dir) -> None:
    created = auth_client.post(
        "/api/v1/documents/text", json={"title": "Gone", "text": NOTES}
    ).json()
    assert list(isolated_upload_dir.rglob("*.txt"))
    assert auth_client.delete(f"/api/v1/documents/{created['id']}").status_code == 204
    assert not list(isolated_upload_dir.rglob("*.txt"))


# Websites


def test_website_is_fetched_titled_and_indexed(auth_client, db, monkeypatch) -> None:
    monkeypatch.setattr(source_service, "fetch", lambda url: _page())
    response = auth_client.post("/api/v1/documents/website", json={"url": "https://example.com/r"})
    assert response.status_code == 201
    body = response.json()
    assert (body["status"], body["title"], body["source_type"]) == (
        "ready",
        "Recursion guide",
        "website",
    )
    assert body["original_filename"] == "https://example.com/r"
    assert db.scalar(select(Document)).mime_type == "text/html"


def test_website_title_can_be_chosen(auth_client, monkeypatch) -> None:
    monkeypatch.setattr(source_service, "fetch", lambda url: _page("Page title"))
    body = auth_client.post(
        "/api/v1/documents/website", json={"url": "https://example.com/r", "title": "Week 3"}
    ).json()
    assert body["title"] == "Week 3"


def test_a_private_address_is_refused_through_the_api(auth_client) -> None:
    response = auth_client.post(
        "/api/v1/documents/website", json={"url": "http://127.0.0.1:8000/x"}
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_url"


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://localhost/",
        "http://10.0.0.5/admin",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "ftp://example.com/file",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "not a url",
    ],
)
def test_addresses_that_are_not_public_web_pages_are_refused(url: str) -> None:
    with pytest.raises(AppError) as error:
        source_service.assert_public_url(url)
    assert error.value.code == "invalid_url"


def test_credentials_in_the_address_are_refused(public_dns) -> None:
    with pytest.raises(AppError):
        source_service.assert_public_url("https://user:secret@example.com/")


def test_a_redirect_to_a_private_address_is_refused(public_dns, monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest"})

    # The first hop is public; the second resolves to the metadata address
    answers = iter([["93.184.216.34"], ["169.254.169.254"]])
    monkeypatch.setattr(source_service, "_resolve_ips", lambda host: next(answers))
    with pytest.raises(AppError) as error:
        source_service.fetch_page_text("https://example.com/", client=_client(handler))
    assert error.value.code == "invalid_url"


def test_too_many_redirects_stop(public_dns) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://example.com/again"})

    with pytest.raises(AppError) as error:
        source_service.fetch_page_text("https://example.com/", client=_client(handler))
    assert "too many times" in error.value.message


def test_a_page_is_reduced_to_its_readable_text(public_dns) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=PAGE, headers={"content-type": "text/html; charset=utf-8"})

    title, text = source_service.fetch_page_text("https://example.com/", client=_client(handler))
    assert title == "Recursion guide"
    assert "Recursion is a method" in text and "Recursion\n" in text
    for dropped in ("Home About", "secret", "Copyright", "color:red"):
        assert dropped not in text


# Links to PDFs


def _pdf_response(body: bytes, content_type: str = "application/pdf"):  # type: ignore[no-untyped-def]
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body, headers={"content-type": content_type})

    return handler


def test_a_link_to_a_pdf_is_downloaded_as_a_pdf(public_dns) -> None:
    pdf = make_pdf([NOTES])
    fetched = source_service.fetch("https://example.com/a.pdf", client=_client(_pdf_response(pdf)))
    assert (fetched.kind, fetched.body) == ("pdf", pdf)


def test_a_pdf_served_as_a_generic_download_is_still_recognised_by_its_address(public_dns) -> None:
    pdf = make_pdf([NOTES])
    handler = _pdf_response(pdf, "application/octet-stream")
    assert (
        source_service.fetch("https://example.com/files/a.pdf", client=_client(handler)).kind
        == "pdf"
    )
    with pytest.raises(AppError):  # the same type with no .pdf in the address is not accepted
        source_service.fetch("https://example.com/files/a", client=_client(handler))


def test_a_pdf_link_that_does_not_return_a_pdf_is_refused(public_dns) -> None:
    handler = _pdf_response(b"<html>login required</html>")
    with pytest.raises(AppError) as error:
        source_service.fetch("https://example.com/a.pdf", client=_client(handler))
    assert "valid PDF" in error.value.message


def test_a_pdf_over_the_upload_limit_is_refused(public_dns) -> None:
    big = b"%PDF-1.4\n" + b"0" * (1024 * 1024 + 10)  # the limit is 1 MB in tests
    with pytest.raises(AppError) as error:
        source_service.fetch("https://example.com/big.pdf", client=_client(_pdf_response(big)))
    assert error.value.status_code == 413


def test_the_page_reader_does_not_accept_a_pdf(public_dns) -> None:
    with pytest.raises(AppError):
        source_service.fetch_page_text(
            "https://example.com/a.pdf", client=_client(_pdf_response(make_pdf([NOTES])))
        )


def test_other_file_types_are_refused(public_dns) -> None:
    handler = _pdf_response(b"PK\x03\x04", "application/zip")
    with pytest.raises(AppError) as error:
        source_service.fetch("https://example.com/a.zip", client=_client(handler))
    assert "not a web page or a PDF" in error.value.message


def test_a_pdf_link_is_added_to_the_library_as_a_pdf(auth_client, db, monkeypatch) -> None:
    pdf = make_pdf([NOTES, "Sorting arranges items in order."])
    monkeypatch.setattr(source_service, "fetch", lambda url: source_service.Fetched("pdf", pdf))
    response = auth_client.post(
        "/api/v1/documents/website", json={"url": "https://example.com/course/Week%203%20notes.pdf"}
    )
    assert response.status_code == 201
    body = response.json()
    assert (body["status"], body["source_type"], body["page_count"]) == ("ready", "pdf", 2)
    assert body["original_filename"] == "Week 3 notes.pdf"
    assert body["title"] == "Week 3 notes"
    chunks = db.scalars(select(DocumentChunk).order_by(DocumentChunk.chunk_index)).all()
    assert [c.page_number for c in chunks] == [1, 2]  # a real PDF keeps its pages


def test_filename_from_a_link() -> None:
    assert source_service.filename_from_url("https://x.org/a/b/Notes.PDF") == "Notes.PDF"
    assert source_service.filename_from_url("https://x.org/download?id=3") == "download.pdf"
    assert source_service.filename_from_url("https://x.org/") == "x.org.pdf"


def test_an_error_page_is_reported(public_dns) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="nope", headers={"content-type": "text/html"})

    with pytest.raises(AppError) as error:
        source_service.fetch_page_text("https://example.com/missing", client=_client(handler))
    assert error.value.code == "website_unavailable" and "404" in error.value.message


def test_an_oversized_page_is_refused(public_dns, monkeypatch) -> None:
    monkeypatch.setattr(source_service, "MAX_PAGE_BYTES", 1000)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="a" * 5000, headers={"content-type": "text/html"})

    with pytest.raises(AppError) as error:
        source_service.fetch_page_text("https://example.com/", client=_client(handler))
    assert error.value.status_code == 413


def test_a_page_with_no_readable_text_fails_with_a_clear_message(auth_client, monkeypatch) -> None:
    monkeypatch.setattr(
        source_service,
        "fetch",
        lambda url: _page("Empty", "Supercalifragilisticexpialidocious wonderful"),
    )
    body = auth_client.post(
        "/api/v1/documents/website", json={"url": "https://example.com/e"}
    ).json()
    assert body["status"] == "failed"
    assert "readable text" in body["error_message"]


def test_title_falls_back_to_the_address() -> None:
    assert source_service.title_from_url("https://example.com/docs/week-3/") == "example.com week-3"
    assert source_service.title_from_url("https://example.com") == "example.com"
