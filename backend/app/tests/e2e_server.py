"""Backend for browser end-to-end tests: real database and real embeddings, fake LLM.

Run with: DATABASE_URL=... .venv/bin/python -m app.tests.e2e_server
It never contacts Groq. Replies are deterministic so the UI flow can be asserted exactly.
"""

import os
import re
from typing import Any

import uvicorn

from app.api.deps import get_db  # noqa: F401  (imported so settings load before the app)
from app.main import app
from app.services.groq_service import GroqService, get_groq_service


class ScriptedLLM(GroqService):
    def __init__(self) -> None:
        super().__init__(None, "scripted")

    def complete_json(
        self, system: str, user: str, *, temperature: float, max_tokens: int
    ) -> dict[str, Any]:
        passages = re.findall(r"\[(\d+)\]\n(.+?)(?=\n\n\[|\n</passages>)", user, flags=re.S)
        if "multiple-choice" in system:
            count = int(re.search(r"Write (\d+)", user).group(1))  # type: ignore[union-attr]
            return {
                "topic": "Recursion",
                "questions": [
                    {
                        "question": f"E2E question {i}: what does a recursive function need?",
                        "options": [
                            "A base case",
                            "A global flag",
                            "A second thread",
                            "A sorted list",
                        ],
                        "correct_index": 0,
                        "explanation": "The notes say a recursive function needs a base case.",
                        "source_passages": [1],
                    }
                    for i in range(1, count + 1)
                ],
            }
        first = passages[0][1].split(".")[0] if passages else "No passage"
        return {
            "answer": f"According to your notes: {first}.",
            "insufficient_evidence": False,
            "used_passages": [1],
        }


app.dependency_overrides[get_groq_service] = lambda: ScriptedLLM()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8001")))
