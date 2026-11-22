# syntax=docker/dockerfile:1
# --- build stage: install Python dependencies into a virtualenv ---
FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /build
COPY requirements.txt .
# CPU-only torch keeps the image small; sentence-transformers works the same
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements.txt
# Download the embedding model now, so the container never needs the internet to start
ENV HF_HOME=/opt/hf
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"

# --- runtime stage: no compilers, non-root user ---
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/opt/hf HF_HUB_OFFLINE=1 \
    PATH="/opt/venv/bin:$PATH" UPLOAD_DIR=/data/uploads
COPY --from=build /opt/venv /opt/venv
COPY --from=build /opt/hf /opt/hf
RUN useradd --system --uid 10001 --create-home app && mkdir -p /data/uploads && chown -R app /data
WORKDIR /app
COPY --chown=app alembic.ini ./
COPY --chown=app alembic ./alembic
COPY --chown=app app ./app
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/api/v1/health')"
# Migrate, then serve. The worker image is the same; compose/render override the command.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
