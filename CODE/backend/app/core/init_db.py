import logging

from app.core.database import get_async_engine
from app.models.db import Base

logger = logging.getLogger(__name__)


async def init_db() -> None:
    engine = get_async_engine()
    if engine is None:
        logger.info("Database engine not configured; skipping table creation")
        return
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables ensured (users, report_archives)")
    except Exception as exc:
        logger.warning("Could not create database tables: %s", exc)
