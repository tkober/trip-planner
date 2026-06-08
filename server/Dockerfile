FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY app ./app

# DB_URL / DB_USER / DB_PASSWORD / DB_OWNER_USER / DB_OWNER_PASSWORD / CORS_ORIGINS
# are read at runtime (app/config.py) — pass them via `docker run --env-file` / -e.
# HOST/PORT default here but can be overridden via env (e.g. from compose).
ENV HOST=0.0.0.0 \
    PORT=8000
EXPOSE 8000

# Shell form so $HOST/$PORT expand at runtime (exec'd via `sh -c`, so uvicorn
# still becomes PID 1's child and receives signals).
CMD ["sh", "-c", "exec uv run uvicorn app.main:app --host \"$HOST\" --port \"$PORT\""]
