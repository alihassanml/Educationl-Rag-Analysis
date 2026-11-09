"""List the chat models available to the configured GROQ_API_KEY."""

import groq

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    if not settings.groq_api_key:
        raise SystemExit("Set GROQ_API_KEY in backend/.env first")
    client = groq.Groq(api_key=settings.groq_api_key)
    for model in sorted(client.models.list().data, key=lambda m: m.id):
        print(model.id)


if __name__ == "__main__":
    main()
