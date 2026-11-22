"""Builds the downloadable study notes PDF for a finished quiz.

The PDF is made from the same AttemptResult the results screen shows, so it can never reveal more
than the student already sees, and it is only available after the quiz was submitted.
"""

import io
import re
from html import escape

import pymupdf

from app.schemas.quizzes import AttemptResult, QuestionResult, SourceRef

_CSS = """
body { font-family: sans-serif; font-size: 10pt; color: #1C1B1A; }
h1 { font-size: 19pt; margin: 0 0 4pt 0; }
h2 { font-size: 11pt; margin: 16pt 0 4pt 0; }
p { margin: 0 0 4pt 0; }
.meta { color: #5C5C5C; font-size: 9pt; }
.score { font-size: 13pt; font-weight: bold; margin-top: 10pt; }
.rule { color: #5C5C5C; font-size: 9pt; margin-top: 2pt; }
.q { font-weight: bold; margin-top: 12pt; }
.ok { color: #1A6E44; font-weight: bold; }
.bad { color: #B3261E; font-weight: bold; }
.opt { margin-left: 14pt; margin-bottom: 1pt; }
.right { font-weight: bold; }
.why { margin-top: 3pt; }
.src { color: #5C5C5C; font-size: 9pt; }
"""

_LETTERS = "ABCDEFGHIJ"


def notes_filename(title: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-").lower()[:60] or "quiz"
    return f"{slug}-notes.pdf"


def _source_label(s: SourceRef) -> str:
    """ "Notes, Chapter 3: Recursion, page 45": the chapter is left out when there is none."""
    parts = [s.document_title]
    if s.section_title:
        parts.append(s.section_title)
    if s.page_number:
        parts.append(f"page {s.page_number}")
    return ", ".join(parts)


def _question_html(number: int, r: QuestionResult) -> str:
    options = []
    for i, option in enumerate(r.options):
        tags = []
        if i == r.correct_index:
            tags.append("correct answer")
        if i == r.selected_index:
            tags.append("your answer")
        suffix = f" ({', '.join(tags)})" if tags else ""
        css = "opt right" if i == r.correct_index else "opt"
        options.append(f'<p class="{css}">{_LETTERS[i]}. {escape(option)}{suffix}</p>')
    verdict = (
        '<span class="ok">Correct</span>' if r.is_correct else '<span class="bad">Incorrect</span>'
    )
    sources = "; ".join(_source_label(s) for s in r.sources)
    source_html = f'<p class="src">Source: {escape(sources)}</p>' if sources else ""
    return (
        f'<p class="q">{number}. {escape(r.question_text)} &nbsp; {verdict}</p>'
        + "".join(options)
        + f'<p class="why">{escape(r.explanation)}</p>'
        + source_html
    )


def _html(result: AttemptResult) -> str:
    taken = result.completed_at.strftime("%d %b %Y")
    topic = f"Topic: {escape(result.topic)} &middot; " if result.topic else ""
    body = "".join(_question_html(i, r) for i, r in enumerate(result.results, start=1))
    return (
        f"<h1>{escape(result.quiz_title)}</h1>"
        f'<p class="meta">{topic}Taken {taken}</p>'
        f'<p class="score">{result.score} of {result.total_questions} correct '
        f"({result.percent}%)</p>"
        '<p class="rule">Scores reflect quiz results on your material, not your ability.</p>'
        f"<h2>Questions and answers</h2>{body}"
    )


def build_notes_pdf(result: AttemptResult) -> bytes:
    story = pymupdf.Story(html=_html(result), user_css=_CSS)
    buffer = io.BytesIO()
    writer = pymupdf.DocumentWriter(buffer)
    page = pymupdf.paper_rect("a4")
    content = page + (48, 56, -48, -56)
    more = True
    while more:
        device = writer.begin_page(page)
        more, _ = story.place(content)
        story.draw(device)
        writer.end_page()
    writer.close()
    return buffer.getvalue()
