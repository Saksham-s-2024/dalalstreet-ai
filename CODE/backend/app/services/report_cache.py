import hashlib
import json
import logging
from enum import Enum
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    return _redis


class ReportMode(str, Enum):
    TRADER = "trader"
    INVESTOR = "investor"


def _cache_key(mode: ReportMode, symbol: str, extra: str = "") -> str:
    """Deterministic cache key for a report request."""
    raw = f"{mode}:{symbol}:{extra}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"report:{digest}"


def _lock_key(cache_key: str) -> str:
    return f"lock:{cache_key}"


async def get_cached_report(
    mode: ReportMode,
    symbol: str,
    extra: str = "",
) -> dict[str, Any] | None:
    """Return a cached report if one exists, else None."""
    try:
        r = await get_redis()
        key = _cache_key(mode, symbol, extra)
        data = await r.get(key)
        if data:
            logger.info("Cache HIT for %s/%s", mode, symbol)
            return json.loads(data)
        logger.info("Cache MISS for %s/%s", mode, symbol)
        return None
    except Exception as exc:
        logger.warning("Redis get failed: %s", exc)
        return None


async def set_cached_report(
    mode: ReportMode,
    symbol: str,
    report: dict[str, Any],
    extra: str = "",
    ttl: int | None = None,
) -> None:
    """Store a report in Redis with TTL."""
    try:
        r = await get_redis()
        key = _cache_key(mode, symbol, extra)
        ttl = ttl or settings.report_cache_ttl_seconds
        await r.setex(key, ttl, json.dumps(report))
        logger.info("Cached report for %s/%s (TTL=%ds)", mode, symbol, ttl)
    except Exception as exc:
        logger.warning("Redis set failed: %s", exc)


async def acquire_report_lock(
    mode: ReportMode,
    symbol: str,
    extra: str = "",
    timeout: int = 30,
) -> bool:
    try:
        r = await get_redis()
        key = _cache_key(mode, symbol, extra)
        lock = _lock_key(key)
        result = await r.set(lock, "1", nx=True, ex=timeout)
        acquired = result is True
        logger.info("Lock %s for %s/%s", "ACQUIRED" if acquired else "SKIPPED", mode, symbol)
        return acquired
    except Exception as exc:
        logger.warning("Redis lock failed: %s — allowing request", exc)
        return True 


async def release_report_lock(
    mode: ReportMode,
    symbol: str,
    extra: str = "",
) -> None:
    """Release the distributed lock after report generation."""
    try:
        r = await get_redis()
        key = _cache_key(mode, symbol, extra)
        await r.delete(_lock_key(key))
    except Exception as exc:
        logger.warning("Redis lock release failed: %s", exc)
