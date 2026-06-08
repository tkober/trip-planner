"""Runtime configuration, read from environment variables (and a local .env).

The Postgres connection uses two roles: an *owner* role that may run DDL (used only
at startup to create the table) and an *app* role for all regular runtime CRUD.
``DB_URL`` carries only host/port/database; credentials and the async driver are
injected per role to build the two SQLAlchemy URLs.
"""
import os

from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url

load_dotenv()

# Host/port/database only — no credentials, no driver scheme.
DB_URL = os.getenv("DB_URL", "postgresql://localhost:5432/trip_planner")

# App role (regular runtime CRUD) and owner role (startup DDL only).
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_OWNER_USER = os.getenv("DB_OWNER_USER", "")
DB_OWNER_PASSWORD = os.getenv("DB_OWNER_PASSWORD", "")

_base = make_url(DB_URL)


def _role_url(user: str, password: str) -> URL:
    """Build an async SQLAlchemy URL for a role from the base DB_URL."""
    return _base.set(
        drivername="postgresql+asyncpg",
        username=user or None,
        password=password or None,
    )


APP_DATABASE_URL = _role_url(DB_USER, DB_PASSWORD)
OWNER_DATABASE_URL = _role_url(DB_OWNER_USER, DB_OWNER_PASSWORD)

# Allowed CORS origins for the browser app. "*" allows any origin.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
] or ["*"]
