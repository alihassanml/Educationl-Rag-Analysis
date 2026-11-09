from functools import lru_cache
from typing import Protocol

from app.core.config import get_settings

# bge models retrieve better when the query carries this instruction; documents do not.
_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class Embedder(Protocol):
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class SentenceTransformerEmbedder:
    """Local embedding model. Loaded lazily because loading takes a few seconds."""

    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._model = None

    def _load(self):  # type: ignore[no-untyped-def]
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name)
        return self._model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        vectors = self._load().encode(texts, normalize_embeddings=True, batch_size=32)
        return [v.tolist() for v in vectors]

    def embed_query(self, text: str) -> list[float]:
        vector = self._load().encode(_QUERY_PREFIX + text, normalize_embeddings=True)
        return vector.tolist()


@lru_cache
def get_embedder() -> Embedder:
    return SentenceTransformerEmbedder(get_settings().embedding_model)
