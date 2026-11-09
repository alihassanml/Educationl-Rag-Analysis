import pytest

from app.services.chunking_service import chunk_pages
from app.services.pdf_service import PageText


def _words(n: int, prefix: str = "w") -> str:
    return " ".join(f"{prefix}{i}" for i in range(n))


def test_short_page_becomes_one_chunk_with_page_number() -> None:
    chunks = chunk_pages([PageText(3, _words(20))], size_words=100, overlap_words=10)
    assert [(c.page_number, c.chunk_index) for c in chunks] == [(3, 0)]


def test_long_page_splits_with_overlap_and_no_lost_words() -> None:
    text = _words(250)
    chunks = chunk_pages([PageText(1, text)], size_words=100, overlap_words=20)
    assert len(chunks) == 3
    first, second = chunks[0].content.split(), chunks[1].content.split()
    assert first[-20:] == second[:20]
    assert set(" ".join(c.content for c in chunks).split()) == set(text.split())


def test_chunks_never_cross_pages_and_indexes_are_sequential() -> None:
    pages = [PageText(1, _words(30, "a")), PageText(2, _words(30, "b"))]
    chunks = chunk_pages(pages, size_words=100, overlap_words=10)
    assert [c.page_number for c in chunks] == [1, 2]
    assert [c.chunk_index for c in chunks] == [0, 1]
    assert "b0" not in chunks[0].content


def test_empty_and_tiny_pages_are_skipped() -> None:
    pages = [PageText(1, ""), PageText(2, "hi"), PageText(3, _words(10))]
    assert [c.page_number for c in chunk_pages(pages, 100, 10)] == [3]


def test_tail_fully_inside_previous_chunk_is_not_emitted() -> None:
    chunks = chunk_pages([PageText(1, _words(105))], size_words=100, overlap_words=20)
    assert len(chunks) == 2
    assert chunks[-1].content.split()[-1] == "w104"


def test_invalid_overlap_rejected() -> None:
    with pytest.raises(ValueError):
        chunk_pages([PageText(1, _words(50))], size_words=10, overlap_words=10)
