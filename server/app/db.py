"""Database engine, ORM model, and session wiring.

A trip is stored as one row: a few scalar columns derived from the document (for
listing / sorting) plus the full ``TripDto`` JSON in a ``JSONB`` column. The
backend is dumb whole-trip storage; schema migration stays a frontend concern.
"""
from datetime import datetime, timezone

from sqlalchemy import Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import DateTime

from .config import APP_DATABASE_URL, OWNER_DATABASE_URL

# Runtime engine: all request-time CRUD runs as the (DDL-less) app role.
engine = create_async_engine(APP_DATABASE_URL, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class TripRow(Base):
    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)


async def init_db() -> None:
    """Create the ``trips`` table if absent (run on startup).

    DDL requires the owner role, so this opens a short-lived owner connection and
    creates the table (idempotent). The app role's access to the new table is
    granted automatically by the server-side ``ALTER DEFAULT PRIVILEGES FOR ROLE
    <owner>`` configuration, so no explicit GRANT is issued here.
    """
    owner_engine = create_async_engine(OWNER_DATABASE_URL, future=True)
    try:
        async with owner_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    finally:
        await owner_engine.dispose()


async def get_session() -> AsyncSession:
    async with SessionLocal() as session:
        yield session


def parse_instant(value: str) -> datetime:
    """Parse an ISO-8601 instant (accepting a trailing 'Z') to an aware datetime."""
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(timezone.utc)
