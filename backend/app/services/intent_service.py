"""Reads what a student is really asking for, so broad requests are not treated like lookups.

A question such as "What is recursion?" matches a passage by similarity. "Quiz me on all topics" or
"Explain the hardest topic in my notes" matches no single passage, so similarity search finds
nothing even though the material is there. Those requests need passages sampled from across
the documents.
"""

import re
import uuid
from collections.abc import Sequence
from typing import Literal

DEFAULT_QUIZ_QUESTIONS = 5
MAX_QUIZ_QUESTIONS = 10

_BROAD = re.compile(
    r"\b(everything|overall|overview|whole|entire|"
    r"all\s+(?:the\s+|of\s+the\s+|my\s+)?(?:topics?|chapters?|material|materials|documents?|notes|"
    r"content|sources?|concepts?|sections?)|"
    r"(?:each|every|any)\s+(?:topic|chapter|section|concept)|the\s+topics?|"
    r"main\s+(?:ideas?|points?|topics?|concepts?)|"
    r"key\s+(?:ideas?|points?|topics?|concepts?|definitions?|terms?)|"
    r"hardest|most\s+(?:important|difficult|confusing|complex)|"
    r"(?:this|these|the|my)\s+(?:documents?|pdfs?|files?|notes|materials?))\b",
    re.IGNORECASE,
)

# Words that only say what to do, not what about. If nothing else is left, there is no topic.
_COMMAND_WORDS = {
    "a", "about", "all", "an", "and", "any", "ask", "at", "can", "cover", "covers", "create",
    "do", "explain", "for", "from", "generate", "give", "help", "i", "in", "is", "it", "list",
    "make", "max", "maximum", "me", "most", "my", "of", "on", "please", "practice", "practise",
    "question", "questions", "quiz", "quizzes", "revise", "short", "simple", "simply", "summarise",
    "summarize", "summary", "test", "the", "to", "topic", "topics", "up", "with", "write", "you",
}  # fmt: skip

_COUNT = re.compile(
    r"(?:(?:max(?:imum)?|up\s+to|at\s+most|upto)\s*(?:of\s*)?(\d{1,3}))|"
    r"(\d{1,3})\s*(?:quiz(?:zes)?|questions?|mcqs?|q\b)",
    re.IGNORECASE,
)


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def requested_question_count(question: str) -> int:
    """How many quiz questions were asked for, kept between 1 and 10. Five when not said."""
    match = _COUNT.search(question)
    if not match:
        return DEFAULT_QUIZ_QUESTIONS
    number = int(match.group(1) or match.group(2))
    return max(1, min(number, MAX_QUIZ_QUESTIONS))


def mentioned_documents(
    question: str, documents: Sequence[tuple[uuid.UUID, str]]
) -> list[uuid.UUID]:
    """Documents whose title the student wrote out, e.g. "the hardest topic in Biology Notes"."""
    text = _normalise(question)
    return [
        document_id
        for document_id, title in documents
        if len(title.strip()) >= 4 and _normalise(title) in text
    ]


# Words before a title that make it the place to look: "the hardest topic IN OS Notes",
# "examples FROM Biology", "summarise OS Notes". Without one, a title that is also a subject
# ("What is recursion?" with a document called "Recursion") is just the subject.
_LOCATING = (
    r"(?:\b(?:in|from|within|inside|using|across|throughout)|"
    r"\b(?:summari[sz]e|outline|overview|review|revise))"
    r"\s+(?:(?:the|my|this|our)\s+)?(?:(?:document|pdf|file|notes|chapter)\s+)?(?:called\s+)?"
)


def located_documents(
    question: str, documents: Sequence[tuple[uuid.UUID, str]]
) -> list[tuple[uuid.UUID, str]]:
    """Documents the student names as where to look ("in OS Notes"), as (id, title)."""
    text = _normalise(question)
    found = []
    for document_id, title in documents:
        name = _normalise(title)
        if len(name) >= 4 and re.search(_LOCATING + re.escape(name) + r"(?![a-z0-9])", text):
            found.append((document_id, title))
    return found


# Words of a question about the material as a whole ("what does this document cover?"), which
# name no subject either
_WHOLE_MATERIAL_WORDS = {
    "are", "be", "covered", "describe", "difficult", "document", "documents", "does", "file",
    "files", "hard", "here", "important", "main", "material", "materials", "notes", "pdf", "pdfs",
    "source", "sources", "teach", "tell", "there", "these", "this", "those", "uploaded", "what",
    "which",
}  # fmt: skip


def has_specific_topic(question: str, ignore: set[str] | frozenset[str] = frozenset()) -> bool:
    """True when something besides instructions is left ("recursion" in "quiz me on recursion")."""
    words = re.findall(r"[a-z][a-z'-]*", question.lower())
    return any(word not in _COMMAND_WORDS and word not in ignore for word in words)


def without_titles(question: str, documents: Sequence[tuple[uuid.UUID, str]]) -> str:
    """The question without the phrases that name these documents as the place to look ("in OS
    Notes"). Such a phrase says where to search, not what for: its words match every passage of
    that document alike. Other mentions of the same words stay ("recursion examples from Recursion"
    keeps the first "recursion")."""
    text = _normalise(question)
    for _, title in documents:
        name = _normalise(title)
        if len(name) >= 4:
            text = re.sub(_LOCATING + re.escape(name) + r"(?![a-z0-9])", " ", text, count=1)
    return " ".join(text.split())


def search_query(question: str, located: Sequence[tuple[uuid.UUID, str]]) -> str:
    """What to search for: the question without the titles of the documents it names as the place
    to look, unless nothing would be left to search for."""
    if not located:
        return question
    rest = without_titles(question, located)
    return rest if has_specific_topic(rest, _WHOLE_MATERIAL_WORDS) else question


def wants_whole_material(
    question: str,
    *,
    mode: str = "ask",
    documents: Sequence[tuple[uuid.UUID, str]] = (),
) -> bool:
    """A broad request with no subject of its own: "explain the hardest topic in <document>",
    "summarise my notes", "what are the key ideas?". Searching for its words can only match the
    wrong passages (an introduction, a contents page), so it is answered from a sample across the
    material without searching first. "Key ideas of recursion" still has a subject, so it is
    searched."""
    located = located_documents(question, documents)
    named = bool(located)
    text = without_titles(question, located)
    broad = bool(_BROAD.search(text))
    if not (broad or named or mode in ("quiz", "summary", "simple")):
        return False
    return not has_specific_topic(_BROAD.sub(" ", text), _WHOLE_MATERIAL_WORDS)


def is_broad_request(
    question: str,
    *,
    mode: str = "ask",
    documents: Sequence[tuple[uuid.UUID, str]] = (),
) -> bool:
    """Should passages be sampled across the material because no single passage will match?

    Used only after normal search found nothing, so a specific question the material does not cover
    still gets an honest "not found".
    """
    if mentioned_documents(question, documents) or _BROAD.search(question):
        return True
    return mode in ("quiz", "summary", "simple") and not has_specific_topic(question)


# Conversation that is not a question about the material. Answered directly, never searched for.
_TAIL = r"[\s!.,?]*$"
_GREETING = re.compile(
    r"^\s*(?:hi+|hello+|hey+|hiya|howdy|yo|sup|good\s+(?:morning|afternoon|evening)|greetings|"
    r"salam|assalam[\w\s-]*|namaste)\b(?:\s+(?:there|tutor|bot|assistant|everyone))?" + _TAIL,
    re.IGNORECASE,
)
_THANKS = re.compile(
    r"^\s*(?:thanks|thank\s+you|thank\s+u|thx|ty|cheers|great|awesome|perfect|cool|nice|ok|okay|"
    r"got\s+it|understood|makes\s+sense)\b(?:[\s,]+(?:a\s+lot|so\s+much|very\s+much|that\s+helps|"
    r"thanks|you))*" + _TAIL,
    re.IGNORECASE,
)
_BYE = re.compile(
    r"^\s*(?:bye|goodbye|see\s+you|see\s+ya|good\s+night|cya)\b.{0,20}$", re.IGNORECASE
)
_HELP = re.compile(
    r"^\s*(?:help|help\s+me|what\s+can\s+you\s+do|what\s+do\s+you\s+do|who\s+are\s+you|"
    r"what\s+are\s+you|how\s+(?:do|does)\s+(?:this|you|it)\s+work|how\s+to\s+use(?:\s+this)?|"
    r"what\s+is\s+this|how\s+can\s+you\s+help(?:\s+me)?)" + _TAIL,
    re.IGNORECASE,
)


def smalltalk_kind(question: str) -> Literal["greeting", "thanks", "bye", "help"] | None:
    """Is the whole message a greeting, thanks, goodbye or "what can you do"? Only whole messages
    count, so "hi, what is recursion?" is still a question about the material."""
    text = question.strip()
    if len(text) > 60:
        return None
    for kind, pattern in (
        ("help", _HELP),
        ("greeting", _GREETING),
        ("thanks", _THANKS),
        ("bye", _BYE),
    ):
        if pattern.match(text):
            return kind  # type: ignore[return-value]
    return None


def smalltalk_reply(kind: str, titles: Sequence[str]) -> str:
    """The tutor's answer to small talk. It states only what the account really contains."""
    count = len(titles)
    if kind == "thanks":
        return "You're welcome! Ask another question whenever you're ready."
    if kind == "bye":
        return (
            "Good luck with your studying. Your chats are saved, so you can pick this up any time."
        )
    library = (
        "Add a document first (a PDF, a link to a page or PDF, or pasted text) in My library, "
        "then ask me anything about it."
        if count == 0
        else f"I can see {count} {'document' if count == 1 else 'documents'} in your library"
        + (
            f": {', '.join(titles[:3])}{' and more' if count > 3 else ''}."
            if count <= 3 or titles
            else "."
        )
    )
    if kind == "greeting":
        if count == 0:
            return f"Hi! I'm your study tutor. {library}"
        return (
            f"Hi! I'm your study tutor. {library} Ask me anything about them, or pick **Quiz me**, "
            "**Summarise** or **Explain simply** below."
        )
    return (
        "I'm your study tutor. I answer only from your own material and show the source for every "
        "answer.\n\n"
        "- **Ask**: a question about your documents\n"
        "- **Quiz me**: up to 10 multiple-choice questions, on a topic or on everything\n"
        "- **Summarise**: the key points of a topic or a whole document\n"
        "- **Explain simply**: plain words for a hard idea\n\n"
        f"{library}"
    )


# A follow-up that only asks for the previous answer in another form: "in bullets", "shorter",
# "translate to Urdu". It has no topic of its own, so searching for its words finds nothing.
_LANGUAGES = (
    "urdu|hindi|arabic|spanish|french|german|chinese|turkish|bengali|persian|indonesian|"
    "portuguese|russian|italian|japanese|korean|punjabi|pashto|swahili|dutch"
)
_REFORMATS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(rf"\b(?:translate|in|to|into)\s+(?:to\s+)?({_LANGUAGES})\b", re.IGNORECASE),
        "Write the whole answer in {language}. Keep the passage numbers like [1] unchanged.",
    ),
    (
        re.compile(
            r"bullet|\b(?:in|as)\s+(?:key\s+|short\s+)?points?\b|point\s*form|as\s+a\s+list", re.I
        ),
        "Write it as a clear bulleted list, one idea per bullet, each ending with its "
        "passage number.",
    ),
    (
        re.compile(r"\btable\b|tabular", re.IGNORECASE),
        "Present it as a Markdown table with sensible columns. Put passage numbers in the cells.",
    ),
    (
        re.compile(r"step[\s-]*by[\s-]*step|\bin\s+steps\b", re.IGNORECASE),
        "Explain it step by step as a numbered list, each step ending with its passage number.",
    ),
    (
        re.compile(
            r"short(?:er|en)?\b|brief(?:ly)?|concise|tl;?dr|one\s+(?:sentence|line)|"
            r"in\s+(?:a\s+)?(?:few|two|2|three|3)\s+(?:sentences|lines|words)",
            re.IGNORECASE,
        ),
        "Make it much shorter: two or three sentences, keeping the passage numbers.",
    ),
    (
        re.compile(
            r"simpl(?:er|y|e)\b|\beasy|\beasier|eli5|like\s+i'?m\s+5|plain\s+(?:words|english)",
            re.I,
        ),
        "Explain it in simpler, plain words that a beginner would understand. "
        "Keep the passage numbers.",
    ),
    (
        re.compile(
            r"more\s+detail|in\s+detail|detailed|elaborate|expand|explain\s+(?:more|further)|"
            r"go\s+deeper|tell\s+me\s+more|more\s+about\s+(?:it|that|this)",
            re.IGNORECASE,
        ),
        "Give a more detailed explanation, still using only the passages, with passage numbers.",
    ),
    (
        re.compile(r"\bexamples?\b", re.IGNORECASE),
        "Give a concrete example, using only what the passages say, with passage numbers.",
    ),
]
_QUESTION_START = re.compile(
    r"^\s*(?:what|why|how|when|where|who|whom|which|whose|is|are|was|were|does|do|did|can|could|"
    r"will|would|define|difference)\b",
    re.IGNORECASE,
)
_MAX_REFORMAT_WORDS = 6


def reformat_instruction(question: str) -> str | None:
    """The instruction for a message that only asks for the last answer in another form, or None.

    Short messages only, and never real questions ("what is a list in Python?"), so a question
    about the material is never mistaken for a formatting request."""
    text = question.strip()
    if not text or len(text.split()) > _MAX_REFORMAT_WORDS or _QUESTION_START.match(text):
        return None
    for pattern, instruction in _REFORMATS:
        if match := pattern.search(text):
            language = match.group(1).capitalize() if match.lastindex else ""
            return instruction.format(language=language)
    return None
