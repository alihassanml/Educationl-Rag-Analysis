import logging
import random
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.config import get_settings
from app.core.errors import BadRequestError, ForbiddenError, NotFoundError
from app.models.quiz import TopicProgress
from app.models.viva import STATUS_COMPLETED, STATUS_IN_PROGRESS, VivaSession, VivaTurn
from app.schemas.viva import (
    VivaCitation,
    VivaSessionDetail,
    VivaSessionSummary,
    VivaTurnPublic,
    VivaTurnReport,
)
from app.services import retrieval_service, topic_service
from app.services.embedding_service import Embedder
from app.services.groq_service import GroqService, LLMOutputError

logger = logging.getLogger("app.viva")

VIVA_QUESTIONS_PROMPT = """You are an oral examiner.
Create viva questions based ONLY on the provided source passages between <passages> tags.
Do not use any outside knowledge.
Generate exactly 5 distinct oral exam questions that test conceptual understanding.
For each question, provide:
- question: Clear, concise oral question (1-2 sentences).
- ideal_answer: Key points that a good answer should include.
- source_indices: List of passage numbers [1, 2, ...] used as evidence.

Return JSON in this format:
{
  "questions": [
    {
      "question": "...",
      "ideal_answer": "...",
      "source_indices": [1]
    }
  ]
}
"""

VIVA_FOLLOWUP_PROMPT = """You are an oral examiner conducting a viva exam.
From the question, answer, and passages, generate ONE short follow-up (1-2 sentences).
Probe deeper understanding: ask WHY, HOW, or ask for a CONCRETE EXAMPLE.
Ground the question strictly in the provided source passages.

Return JSON:
{
  "follow_up_question": "..."
}
"""

VIVA_GRADING_PROMPT = """You are grading an oral exam response against a rubric.
Source passages are provided between <passages> tags.
Question: {question}
Student's initial answer: {student_answer}
Examiner's follow-up: {follow_up}
Student's follow-up answer: {follow_up_answer}

Grade according to this strict rubric:
- accuracy (0-2): 0 if incorrect, 1 if partially accurate, 2 if fully accurate.
- completeness (0-2): 0 if missed essential points, 1 if partial, 2 if covers key concepts.
- own_words (0-2): 0 if parroting, 1 if moderate grasp, 2 if explains clearly in own words.
- feedback: 1-3 sentences explaining the rating citing passages.
- ideal_answer: 2-3 sentences showing a model answer.

Return JSON:
{{
  "accuracy": 2,
  "completeness": 2,
  "own_words": 2,
  "feedback": "...",
  "ideal_answer": "..."
}}
"""


def _format_passages(chunks: list[retrieval_service.RetrievedChunk]) -> str:
    lines = ["<passages>"]
    for i, c in enumerate(chunks, start=1):
        lines.append(f"[{i}] {c.document_title} (p. {c.page_number or 1})")
        lines.append(c.content.strip())
        lines.append("")
    lines.append("</passages>")
    return "\n".join(lines)


def start_viva_session(
    db: Session,
    embedder: Embedder,
    llm: GroqService,
    user_id: uuid.UUID,
    topic_name: str,
) -> VivaSessionDetail:
    topic = topic_service.find_topic(db, user_id, topic_name)
    topic_label = topic.name if topic else topic_name.strip()

    # Retrieve passages for this topic
    chunks: list[retrieval_service.RetrievedChunk] = []
    if topic:
        chunks = topic_service.anchor_chunks(db, user_id, topic.id, 12)
    if not chunks:
        chunks = retrieval_service.retrieve(db, embedder, user_id, query=topic_label, top_k=10)

    if not chunks:
        raise BadRequestError(
            f"No study material found for topic '{topic_label}'. "
            "Upload notes covering this topic first."
        )

    # Reshuffle passages to ensure varied questions on each session
    shuffled_chunks = list(chunks)
    random.shuffle(shuffled_chunks)
    sample_chunks = shuffled_chunks[:8]

    passages_text = _format_passages(sample_chunks)
    prompt = f"{passages_text}\n\nGenerate 5 oral exam questions for topic: {topic_label}"

    try:
        data = llm.complete_json(VIVA_QUESTIONS_PROMPT, prompt, temperature=0.7, max_tokens=1500)
    except Exception as exc:
        logger.error("Failed to generate viva questions: %s", exc)
        raise BadRequestError(
            "Could not generate viva questions right now. Please try again."
        ) from exc

    raw_questions = data.get("questions")
    if not isinstance(raw_questions, list) or len(raw_questions) < 1:
        raise LLMOutputError("Model failed to produce viva questions")

    session = VivaSession(
        user_id=user_id,
        topic_name=topic_label,
        status=STATUS_IN_PROGRESS,
        total_score=0,
        max_score=len(raw_questions[:5]) * 6,
    )
    db.add(session)
    db.flush()

    for idx, q in enumerate(raw_questions[:5]):
        indices = [
            int(i)
            for i in q.get("source_indices", [])
            if isinstance(i, int | str) and str(i).isdigit()
        ]
        sources = []
        for i in indices:
            if 1 <= i <= len(sample_chunks):
                chunk = sample_chunks[i - 1]
                sources.append(
                    {
                        "document_title": chunk.document_title,
                        "page_number": chunk.page_number,
                        "section_title": chunk.section_title,
                        "start_seconds": chunk.start_seconds,
                        "source_url": chunk.source_url,
                    }
                )
        if not sources and sample_chunks:
            chunk = sample_chunks[0]
            sources.append(
                {
                    "document_title": chunk.document_title,
                    "page_number": chunk.page_number,
                    "section_title": chunk.section_title,
                    "start_seconds": chunk.start_seconds,
                    "source_url": chunk.source_url,
                }
            )

        turn = VivaTurn(
            session_id=session.id,
            turn_index=idx,
            question_text=str(q.get("question", "")).strip(),
            source_citations=sources,
            ideal_answer=str(q.get("ideal_answer", "")).strip(),
        )
        db.add(turn)

    db.commit()
    return get_session_detail(db, user_id, session.id)


def get_session_detail(db: Session, user_id: uuid.UUID, session_id: uuid.UUID) -> VivaSessionDetail:
    session = db.scalar(
        select(VivaSession)
        .options(selectinload(VivaSession.turns))
        .where(VivaSession.id == session_id)
    )
    if not session:
        raise NotFoundError("Viva session not found")
    if session.user_id != user_id:
        raise ForbiddenError("Access denied")

    completed_turns: list[VivaTurnReport] = []
    current_turn_public: VivaTurnPublic | None = None
    current_turn_idx = 0

    turns = sorted(session.turns, key=lambda t: t.turn_index)
    for t in turns:
        if t.grade_score is not None:
            sources = [VivaCitation(**s) for s in t.source_citations]
            completed_turns.append(
                VivaTurnReport(
                    turn_index=t.turn_index,
                    question_text=t.question_text,
                    follow_up_question=t.follow_up_question,
                    student_answer=t.student_answer,
                    follow_up_answer=t.follow_up_answer,
                    grade_accuracy=t.grade_accuracy or 0,
                    grade_completeness=t.grade_completeness or 0,
                    grade_own_words=t.grade_own_words or 0,
                    grade_score=t.grade_score or 0,
                    grade_feedback=t.grade_feedback or "",
                    ideal_answer=t.ideal_answer or "",
                    sources=sources,
                )
            )
        elif current_turn_public is None:
            current_turn_idx = t.turn_index
            current_turn_public = VivaTurnPublic(
                turn_index=t.turn_index,
                question_text=t.question_text,
                follow_up_question=t.follow_up_question,
                student_answer=t.student_answer,
                follow_up_answer=t.follow_up_answer,
                is_follow_up_pending=t.student_answer is not None
                and t.follow_up_question is not None,
                is_completed=False,
            )

    return VivaSessionDetail(
        id=session.id,
        topic_name=session.topic_name,
        status=session.status,
        tab_switch_count=session.tab_switch_count,
        current_turn_index=current_turn_idx,
        total_turns=len(turns),
        time_limit_seconds=get_settings().viva_time_limit_seconds,
        current_turn=current_turn_public,
        total_score=session.total_score if session.status == STATUS_COMPLETED else None,
        max_score=session.max_score if session.status == STATUS_COMPLETED else None,
        overall_feedback=session.overall_feedback,
        completed_turns=completed_turns,
        created_at=session.created_at,
        completed_at=session.completed_at,
    )


def record_tab_switch(
    db: Session, user_id: uuid.UUID, session_id: uuid.UUID, count: int = 1
) -> int:
    session = db.scalar(select(VivaSession).where(VivaSession.id == session_id))
    if not session:
        raise NotFoundError("Session not found")
    if session.user_id != user_id:
        raise ForbiddenError("Access denied")
    session.tab_switch_count += count
    db.commit()
    return session.tab_switch_count


def submit_answer(
    db: Session,
    llm: GroqService,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    turn_index: int,
    answer: str,
    is_follow_up: bool,
) -> VivaSessionDetail:
    session = db.scalar(
        select(VivaSession)
        .options(selectinload(VivaSession.turns))
        .where(VivaSession.id == session_id)
    )
    if not session:
        raise NotFoundError("Viva session not found")
    if session.user_id != user_id:
        raise ForbiddenError("Access denied")
    if session.status != STATUS_IN_PROGRESS:
        raise BadRequestError("This viva session is already completed")

    turns = {t.turn_index: t for t in session.turns}
    turn = turns.get(turn_index)
    if not turn:
        raise NotFoundError("Turn not found")

    cleaned_answer = answer.strip()
    if not cleaned_answer:
        raise BadRequestError("Answer cannot be blank")

    # Format passages for turn
    passages_lines = ["<passages>"]
    for s in turn.source_citations:
        passages_lines.append(f"{s.get('document_title')} (p. {s.get('page_number')})")
    passages_lines.append("</passages>")
    passages_context = "\n".join(passages_lines)

    if not is_follow_up:
        # Step 1: Save initial student answer and generate follow-up probing question
        turn.student_answer = cleaned_answer
        prompt = (
            f"{passages_context}\n\n"
            f"Topic: {session.topic_name}\n"
            f"Question: {turn.question_text}\n"
            f"Student Answer: {turn.student_answer}\n\n"
            "Generate one probing follow-up question."
        )
        try:
            res = llm.complete_json(VIVA_FOLLOWUP_PROMPT, prompt, temperature=0.5, max_tokens=300)
            turn.follow_up_question = str(
                res.get("follow_up_question", "Could you elaborate with a specific example?")
            ).strip()
        except Exception:
            turn.follow_up_question = (
                "Why does that happen, and could you provide a concrete example from your material?"
            )

        db.commit()
        return get_session_detail(db, user_id, session.id)

    # Step 2: Save follow-up answer and grade the turn
    turn.follow_up_answer = cleaned_answer
    grading_prompt = VIVA_GRADING_PROMPT.format(
        question=turn.question_text,
        student_answer=turn.student_answer or "(none)",
        follow_up=turn.follow_up_question or "(none)",
        follow_up_answer=turn.follow_up_answer,
    )
    full_prompt = f"{passages_context}\n\n{grading_prompt}"

    try:
        grade_data = llm.complete_json(
            "You are a strict academic evaluator.", full_prompt, temperature=0.2, max_tokens=600
        )
    except Exception as exc:
        logger.error("Failed to grade viva turn: %s", exc)
        grade_data = {
            "accuracy": 1,
            "completeness": 1,
            "own_words": 1,
            "feedback": "Answer noted. Demonstrates baseline understanding.",
            "ideal_answer": turn.ideal_answer or "Review your course notes on this concept.",
        }

    acc = max(0, min(2, int(grade_data.get("accuracy", 1))))
    comp = max(0, min(2, int(grade_data.get("completeness", 1))))
    own = max(0, min(2, int(grade_data.get("own_words", 1))))
    score = acc + comp + own

    turn.grade_accuracy = acc
    turn.grade_completeness = comp
    turn.grade_own_words = own
    turn.grade_score = score
    turn.grade_feedback = str(grade_data.get("feedback", "")).strip()
    if grade_data.get("ideal_answer"):
        turn.ideal_answer = str(grade_data.get("ideal_answer")).strip()

    # Check if session is completed (all turns graded)
    graded_turns = [t for t in session.turns if t.grade_score is not None or t.id == turn.id]
    if len(graded_turns) >= len(session.turns):
        session.status = STATUS_COMPLETED
        session.completed_at = datetime.now(UTC)
        total = sum(t.grade_score or 0 for t in session.turns if t.id != turn.id) + score
        session.total_score = total
        session.max_score = len(session.turns) * 6

        pct = round(total * 100 / (session.max_score or 1))
        switch_note = (
            f" Note: {session.tab_switch_count} tab switches were detected during the examination."
            if session.tab_switch_count > 0
            else ""
        )
        session.overall_feedback = (
            f"Oral exam completed with score {total}/{session.max_score} ({pct}%).{switch_note}"
        )

        # Update TopicProgress with weighted contribution
        settings = get_settings()
        topic = topic_service.find_topic(db, user_id, session.topic_name)
        if topic:
            progress = db.scalar(
                select(TopicProgress).where(
                    TopicProgress.user_id == user_id,
                    TopicProgress.topic_id == topic.id,
                )
            )
            if not progress:
                progress = TopicProgress(
                    user_id=user_id, topic_id=topic.id, attempt_count=0, correct_count=0
                )
                db.add(progress)

            # Viva results count towards topic mastery
            # e.g. weight questions and correct proportionally
            added_attempts = int(len(session.turns) * settings.viva_progress_weight)
            added_correct = int((total / (session.max_score or 1)) * added_attempts)
            progress.attempt_count += max(1, added_attempts)
            progress.correct_count += added_correct
            progress.last_practiced_at = datetime.now(UTC)

    db.commit()
    return get_session_detail(db, user_id, session.id)


def list_sessions(db: Session, user_id: uuid.UUID) -> list[VivaSessionSummary]:
    sessions = db.scalars(
        select(VivaSession)
        .where(VivaSession.user_id == user_id)
        .order_by(VivaSession.created_at.desc())
    ).all()
    return [
        VivaSessionSummary(
            id=s.id,
            topic_name=s.topic_name,
            status=s.status,
            total_score=s.total_score,
            max_score=s.max_score,
            tab_switch_count=s.tab_switch_count,
            created_at=s.created_at,
            completed_at=s.completed_at,
        )
        for s in sessions
    ]
