FROM python:3.13-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.11.22 /uv /uvx /bin/

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app
COPY main.py ./

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app \
    PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
