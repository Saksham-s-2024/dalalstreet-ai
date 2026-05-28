"""
Async SQLAlchemy engine for PostgreSQL (optional for core API — used when you add models/migrations).
Set DATABASE_URL in .env, e.g. postgresql+asyncpg://user:password@localhost:5432/dalalstreet
"""
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_async_engine() -> AsyncEngine | None:
    """Lazily create engine from DATABASE_URL. Returns None if URL missing or not PostgreSQL."""
    global _engine
    if _engine is not None:
        return _engine
    url = (settings.database_url or "").strip()
    if not url.startswith("postgresql"):
        return None
    _engine = create_async_engine(
        url,
        pool_pre_ping=True,
        echo=settings.debug,
    )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession] | None:
    """Async session factory for route dependencies (when you add DB queries)."""
    global _session_factory
    engine = get_async_engine()
    if engine is None:
        return None
    if _session_factory is None:
        _session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return _session_factory


async def check_database_connection() -> dict[str, Any]:
    """Ping PostgreSQL; used by /api/v1/health. Does not fail the app if DB is down."""
    engine = get_async_engine()
    if engine is None:
        return {
            "ok": False,
            "detail": "DATABASE_URL not set or not a postgresql+asyncpg URL",
        }
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"ok": True, "detail": "connected"}
    except Exception as exc:
        logger.warning("PostgreSQL health check failed: %s", exc)
        return {"ok": False, "detail": str(exc)[:240]}
