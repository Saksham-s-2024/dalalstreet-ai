
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field, validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, parse_bearer_user_id
from app.core.rate_limit import limiter
from app.core.security import sanitize_symbol, sanitize_text, sanitize_ticker_list
from app.core.database import check_database_connection
from app.models import ReportArchive
from app.services.ai_reports import generate_investor_report, generate_trader_report
from app.services.market_data import (
    NIFTY50_SYMBOLS,
    fetch_historical_ohlc,
    fetch_quote,
    get_market_status,
)
from app.services.report_archive import archive_user_report

router = APIRouter(prefix="/api/v1")

# ── Request / Response Models ──────────────────────────────────

class TraderReportRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)
    timestamp: str | None = None

    @validator("symbol")
    def clean_symbol(cls, v):
        try:
            return sanitize_symbol(v)
        except ValueError as exc:
            raise ValueError(str(exc))

    @validator("timestamp", pre=True, always=True)
    def default_timestamp(cls, v):
        return v or datetime.now().isoformat()


class InvestorReportRequest(BaseModel):
    asset_type: str = Field(..., min_length=2, max_length=50)
    risk_appetite: str = Field(..., pattern="^(LOW|MODERATE|HIGH)$")
    symbols: list[str] = Field(default_factory=list, max_items=10)

    @validator("asset_type")
    def clean_asset_type(cls, v):
        return sanitize_text(v, max_len=50)

    @validator("symbols", each_item=True)
    def clean_symbols(cls, v):
        return sanitize_symbol(v)


class QuoteRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20)

    @validator("symbol")
    def clean(cls, v):
        return sanitize_symbol(v)


# ── Market Status ─────────────────────────────────────────────

@router.get("/market/status")
@limiter.limit("30/minute")
async def market_status(request: Request):
    return await get_market_status()


@router.get("/market/symbols")
@limiter.limit("20/minute")
async def list_symbols(request: Request):
    return {"symbols": NIFTY50_SYMBOLS}


# ── Live Quote ────────────────────────────────────────────────

@router.get("/market/quote/{symbol}")
@limiter.limit("60/minute")
async def get_quote(request: Request, symbol: str):
    try:
        clean = sanitize_symbol(symbol)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    return await fetch_quote(clean)


# ── Historical OHLC ───────────────────────────────────────────

@router.get("/market/ohlc/{symbol}")
@limiter.limit("20/minute")
async def get_ohlc(request: Request, symbol: str, days: int = 5, interval: str = "1minute"):
    try:
        clean = sanitize_symbol(symbol)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid symbol format")

    days = min(max(days, 1), 365)
    if interval not in ("1minute", "5minute", "15minute", "30minute", "60minute", "day"):
        interval = "1minute"

    candles = await fetch_historical_ohlc(clean, interval=interval, days=days)
    return {"symbol": clean, "interval": interval, "candles": candles}


# ── Trader Mode — Risk Report ─────────────────────────────────

@router.post("/trader/report")
@limiter.limit("10/minute")
async def trader_report(
    request: Request,
    body: TraderReportRequest,
    authorization: Annotated[str | None, Header()] = None,
):
    """
    Generate an intraday risk assessment report for a given symbol.
    Cached in Redis — duplicate requests within 5 min return cached result.
    If Authorization: Bearer <JWT> is sent, the report is stored in PostgreSQL for history.
    """
    report = await generate_trader_report(body.symbol, body.timestamp)
    if "error" in report:
        raise HTTPException(status_code=503, detail=report["error"])
    uid = parse_bearer_user_id(authorization)
    if uid:
        title = f"{body.symbol} — intraday risk report"
        await archive_user_report(uid, "trader", title, report)
    return report


# ── Investor Mode — Recommendation Report ────────────────────

@router.post("/investor/report")
@limiter.limit("5/minute")
async def investor_report(
    request: Request,
    body: InvestorReportRequest,
    authorization: Annotated[str | None, Header()] = None,
):
    """
    Generate a long-term investment recommendation report.
    Cached for 1 hour — duplicate requests return cached result.
    If Authorization: Bearer <JWT> is sent, the report is stored in PostgreSQL for history.
    """
    # If no symbols provided, pick defaults based on asset_type
    symbols = body.symbols or _default_symbols(body.asset_type)

    report = await generate_investor_report(
        asset_type=body.asset_type,
        risk_appetite=body.risk_appetite,
        symbols=symbols,
    )
    if "error" in report:
        raise HTTPException(status_code=503, detail=report["error"])
    uid = parse_bearer_user_id(authorization)
    if uid:
        title = f"Investor — {body.asset_type} / {body.risk_appetite}"
        await archive_user_report(uid, "investor", title, report)
    return report


def _default_symbols(asset_type: str) -> list[str]:
    defaults = {
        "large_cap": ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"],
        "small_cap": ["TITAN", "BAJFINANCE", "AXISBANK", "ITC", "LT"],
        "etf": ["NIFTYBEES", "GOLDBEES", "BANKBEES", "JUNIORBEES", "ITBEES"],
        "mutual_fund": ["RELIANCE", "HDFCBANK", "TCS", "INFY", "BHARTIARTL"],
    }
    key = asset_type.lower().replace(" ", "_").replace("-", "_")
    return defaults.get(key, NIFTY50_SYMBOLS[:5])


# ── Saved reports (requires login) ───────────────────────────

class ReportHistoryItem(BaseModel):
    id: str
    kind: str
    title: str
    created_at: str
    payload: dict


@router.get("/reports/history")
@limiter.limit("60/minute")
async def reports_history(
    request: Request,
    limit: int = 50,
    user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    limit = min(max(limit, 1), 100)
    result = await session.execute(
        select(ReportArchive)
        .where(ReportArchive.user_id == user.id)
        .order_by(ReportArchive.created_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    return {
        "reports": [
            ReportHistoryItem(
                id=r.id,
                kind=r.kind,
                title=r.title,
                created_at=r.created_at.isoformat() if r.created_at else "",
                payload=r.payload,
            )
            for r in rows
        ]
    }


# ── Health Check ─────────────────────────────────────────────

@router.get("/health")
async def health():
    db = await check_database_connection()
    return {
        "status": "ok",
        "version": "2.0.0",
        "service": "DalalStreet AI",
        "database": db,
    }
