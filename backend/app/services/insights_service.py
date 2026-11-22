"""Study insights for the dashboard: how the student uses their material, built only from rows
that already exist (chat messages, citations, quiz attempts and the library). Nothing is estimated.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import and_, distinct, func, select
from sqlalchemy.orm import Session

from app.models.chat import (
    RATING_DOWN,
    RATING_UP,
    ROLE_ASSISTANT,
    ROLE_USER,
    STATUS_COMPLETE,
    ChatCitation,
    ChatMessage,
    MessageFeedback,
)
from app.models.document import STATUS_READY, Document, DocumentChunk
from app.models.quiz import QuizAttempt
from app.schemas.progress import DayActivity, DocumentUsage, HotPage, StudyInsights

ACTIVITY_DAYS = 84  # twelve full weeks for the heatmap
HOT_PAGES = 5


def _zone(tz: str | None) -> str:
    """The student's IANA time zone, so "today" and streaks follow their calendar. Else UTC."""
    if not tz:
        return "UTC"
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        return "UTC"
    return tz


def _source_type(mime_type: str) -> str:
    return {"text/html": "website", "text/plain": "text"}.get(mime_type, "pdf")


def streaks(days: set[date], today: date) -> tuple[int, int]:
    """(current, longest) runs of consecutive active days. A streak still counts if the student was
    active yesterday but not yet today, so it does not reset first thing in the morning."""
    longest = run = 0
    previous: date | None = None
    for day in sorted(days):
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        longest = max(longest, run)
        previous = day

    start = today if today in days else today - timedelta(days=1)
    current = 0
    while start - timedelta(days=current) in days:
        current += 1
    return current, longest


def insights(db: Session, user_id: uuid.UUID, tz: str | None = None) -> StudyInsights:
    zone = _zone(tz)
    today = datetime.now(UTC).astimezone(ZoneInfo(zone)).date()
    window_start = today - timedelta(days=ACTIVITY_DAYS - 1)

    # --- Daily activity: questions typed and quizzes finished, per local calendar day ---
    question_day = func.date(func.timezone(zone, ChatMessage.created_at))
    question_rows = db.execute(
        select(question_day, func.count())
        .where(ChatMessage.user_id == user_id, ChatMessage.role == ROLE_USER)
        .group_by(question_day)
    ).all()
    quiz_day = func.date(func.timezone(zone, QuizAttempt.completed_at))
    quiz_rows = db.execute(
        select(quiz_day, func.count()).where(QuizAttempt.user_id == user_id).group_by(quiz_day)
    ).all()
    questions_by_day = {d: n for d, n in question_rows}
    quizzes_by_day = {d: n for d, n in quiz_rows}
    active = set(questions_by_day) | set(quizzes_by_day)
    current, longest = streaks(active, today)
    activity = [
        DayActivity(
            date=day,
            questions=questions_by_day.get(day, 0),
            quizzes=quizzes_by_day.get(day, 0),
        )
        for day in (window_start + timedelta(days=i) for i in range(ACTIVITY_DAYS))
    ]

    # --- Answer quality: grounded answers versus "not found in your material" ---
    questions_asked = sum(questions_by_day.values())
    cited_answers = (
        select(ChatCitation.message_id).where(ChatCitation.message_id == ChatMessage.id).exists()
    )
    answers_with_sources = (
        db.scalar(
            select(func.count()).where(
                ChatMessage.user_id == user_id,
                ChatMessage.role == ROLE_ASSISTANT,
                ChatMessage.status == STATUS_COMPLETE,
                ChatMessage.abstained.is_(False),
                cited_answers,
            )
        )
        or 0
    )
    answers_not_found = (
        db.scalar(
            select(func.count()).where(
                ChatMessage.user_id == user_id,
                ChatMessage.role == ROLE_ASSISTANT,
                ChatMessage.abstained.is_(True),
            )
        )
        or 0
    )
    citations_total = (
        db.scalar(
            select(func.count())
            .select_from(ChatCitation)
            .join(ChatMessage, ChatMessage.id == ChatCitation.message_id)
            .where(ChatMessage.user_id == user_id)
        )
        or 0
    )
    votes = dict(
        db.execute(
            select(MessageFeedback.rating, func.count())
            .where(MessageFeedback.user_id == user_id)
            .group_by(MessageFeedback.rating)
        ).all()
    )

    # --- Library: each ready document with how much of it the tutor has actually used ---
    chunk_counts = (
        select(DocumentChunk.document_id, func.count().label("n"))
        .where(DocumentChunk.user_id == user_id)
        .group_by(DocumentChunk.document_id)
        .subquery()
    )
    cite_stats = (
        select(
            ChatCitation.document_id,
            func.count().label("times"),
            func.count(distinct(ChatCitation.page_number)).label("pages"),
            func.max(ChatMessage.created_at).label("last"),
        )
        .join(ChatMessage, ChatMessage.id == ChatCitation.message_id)
        .where(ChatMessage.user_id == user_id, ChatCitation.document_id.is_not(None))
        .group_by(ChatCitation.document_id)
        .subquery()
    )
    doc_rows = db.execute(
        select(
            Document,
            func.coalesce(chunk_counts.c.n, 0),
            func.coalesce(cite_stats.c.times, 0),
            func.coalesce(cite_stats.c.pages, 0),
            cite_stats.c.last,
        )
        .outerjoin(chunk_counts, chunk_counts.c.document_id == Document.id)
        .outerjoin(cite_stats, cite_stats.c.document_id == Document.id)
        .where(Document.user_id == user_id, Document.status == STATUS_READY)
        .order_by(Document.created_at.desc())
    ).all()
    documents = [
        DocumentUsage(
            id=doc.id,
            title=doc.title,
            source_type=_source_type(doc.mime_type),
            page_count=doc.page_count,
            chunk_count=chunks,
            times_cited=times,
            pages_cited=pages,
            last_cited_at=last,
        )
        for doc, chunks, times, pages, last in doc_rows
    ]

    # --- The pages the student keeps coming back to ---
    hot_rows = db.execute(
        select(Document.id, Document.title, ChatCitation.page_number, func.count().label("times"))
        .join(ChatMessage, ChatMessage.id == ChatCitation.message_id)
        .join(Document, and_(Document.id == ChatCitation.document_id, Document.user_id == user_id))
        .where(ChatMessage.user_id == user_id, ChatCitation.page_number.is_not(None))
        .group_by(Document.id, Document.title, ChatCitation.page_number)
        .order_by(func.count().desc(), Document.title, ChatCitation.page_number)
        .limit(HOT_PAGES)
    ).all()
    hot_pages = [
        HotPage(document_id=d, document_title=t, page_number=p, times_cited=n)
        for d, t, p, n in hot_rows
    ]

    return StudyInsights(
        questions_asked=questions_asked,
        answers_with_sources=answers_with_sources,
        answers_not_found=answers_not_found,
        citations_total=citations_total,
        pages_indexed=sum(d.page_count or 0 for d in documents),
        chunks_indexed=sum(d.chunk_count for d in documents),
        helpful_votes=votes.get(RATING_UP, 0),
        unhelpful_votes=votes.get(RATING_DOWN, 0),
        active_days=len(active),
        current_streak=current,
        longest_streak=longest,
        today=today,
        activity=activity,
        documents=documents,
        hot_pages=hot_pages,
    )


__all__ = ["insights", "streaks"]
