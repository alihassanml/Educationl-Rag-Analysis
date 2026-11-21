import logging
from collections.abc import Sequence
from dataclasses import dataclass

from app.services.groq_service import GroqService, LLMOutputError, LLMUnavailableError

logger = logging.getLogger("app.rewrite")

MAX_HISTORY_TURNS = 6  # the last three question and answer pairs are enough to resolve "it"
MAX_ANSWER_CHARS = 300
MAX_QUERY_CHARS = 500

REWRITE_PROMPT = """You rewrite a student's follow-up question so it can be understood without \
the earlier conversation.

Rules:
- Use the conversation ONLY to resolve references such as "it", "that", "the second one".
- Do not answer the question. Do not add facts, topics or details that are not in the conversation \
or the question.
- If the question is already complete on its own, return it unchanged.
- Keep it to one short question in the student's own wording.

Reply with a JSON object: {"standalone_question": string}"""


@dataclass(frozen=True)
class RewriteResult:
    query: str  # what retrieval should search for
    ran: bool  # a model call was made
    changed: bool  # the searched question differs from what the student typed
    fallback: bool  # the call failed or returned nothing usable, so the original was kept


def _transcript(history: Sequence[tuple[str, str]]) -> str:
    lines = []
    for role, content in history[-MAX_HISTORY_TURNS:]:
        text = " ".join(content.split())
        if role == "assistant" and len(text) > MAX_ANSWER_CHARS:
            text = text[:MAX_ANSWER_CHARS] + "..."
        lines.append(f"{'Student' if role == 'user' else 'Tutor'}: {text}")
    return "\n".join(lines)


def rewrite_followup(
    llm: GroqService, history: Sequence[tuple[str, str]], question: str
) -> RewriteResult:
    """Turn a follow-up into a standalone question. The conversation is used for this one job
    only: the answer prompt never sees it, and earlier answers are never evidence.

    The first message of a thread is searched as typed. Any failure keeps the original question,
    so a rewrite problem can never fail the whole message."""
    if not history:
        return RewriteResult(question, ran=False, changed=False, fallback=False)

    user = f"Conversation so far:\n{_transcript(history)}\n\nFollow-up question: {question}"
    try:
        reply = llm.complete_json(REWRITE_PROMPT, user, temperature=0.0, max_tokens=150)
    except (LLMUnavailableError, LLMOutputError) as exc:
        logger.warning("Follow-up rewrite failed, using the original question: %s", exc)
        return RewriteResult(question, ran=True, changed=False, fallback=True)

    rewritten = reply.get("standalone_question")
    if not isinstance(rewritten, str) or not rewritten.strip() or len(rewritten) > MAX_QUERY_CHARS:
        return RewriteResult(question, ran=True, changed=False, fallback=True)
    rewritten = rewritten.strip()
    return RewriteResult(rewritten, ran=True, changed=rewritten != question.strip(), fallback=False)
