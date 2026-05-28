"""
DalalStreet AI — Market Data Service (yfinance)
Quotes and OHLC for NSE-listed equities via Yahoo Finance (e.g. SYMBOL.NS).
Falls back to mock data when downloads fail or return no rows.
"""
import asyncio
import logging
import random
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any

import yfinance as yf

logger = logging.getLogger(__name__)

NIFTY50_SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "HINDUNILVR",
    "ICICIBANK", "KOTAKBANK", "BHARTIARTL", "ITC", "AXISBANK",
    "LT", "ASIANPAINT", "MARUTI", "TITAN", "BAJFINANCE",
    "SUNPHARMA", "ULTRACEMCO", "HCLTECH", "WIPRO", "NESTLEIND",
    "ADANIENT", "TATASTEEL", "NTPC", "M&M", "JSWSTEEL", "TATAMOTORS",
]

def _yahoo_ticker(symbol: str) -> str:
    s = symbol.strip()
    if s.startswith("^") or s.endswith(".NS") or s.endswith(".BO"):
        return s
    return f"{s.upper()}.NS"

def _map_interval(interval: str) -> str:
    if interval in ("1minute", "1m"):
        return "1m"
    if interval in ("day", "1d", "1D"):
        return "1d"
    return "1d"

def _sync_fetch_quote(symbol: str) -> dict[str, Any] | None:
    try:
        t = yf.Ticker(_yahoo_ticker(symbol))
        # period="5d" for speed
        daily = t.history(period="5d", interval="1d", auto_adjust=True)
        if daily.empty:
            return None

        intra = t.history(period="1d", interval="1m", auto_adjust=True)
        if not intra.empty:
            row = intra.iloc[-1]
            ltp = float(row["Close"])
            open_ = float(row["Open"])
            high = float(row["High"])
            low = float(row["Low"])
            vol = int(row["Volume"]) if row["Volume"] == row["Volume"] else 0
        else:
            row = daily.iloc[-1]
            ltp = float(row["Close"])
            open_ = float(row["Open"])
            high = float(row["High"])
            low = float(row["Low"])
            vol = int(row["Volume"]) if row["Volume"] == row["Volume"] else 0

        prev_close = float(daily.iloc[-2]["Close"]) if len(daily) > 1 else float(daily.iloc[-1]["Open"])
        change_pct = round(((ltp - prev_close) / prev_close) * 100, 4) if prev_close else 0.0

        spread = max(0.01, ltp * 0.0002)
        return {
            "symbol": symbol,
            "ltp": round(ltp, 2),
            "open": round(open_, 2),
            "high": round(high, 2),
            "low": round(low, 2),
            "close": round(ltp, 2),
            "volume": vol,
            "change_pct": round(change_pct, 2),
            "bid": round(ltp - spread / 2, 2),
            "ask": round(ltp + spread / 2, 2),
            "timestamp": datetime.now().isoformat(),
            "is_mock": False,
        }
    except Exception as exc:
        logger.warning("yfinance quote failed for %s: %s", symbol, exc)
        return None

_quote_cache: dict[str, dict[str, Any]] = {}
_cache_lock = asyncio.Lock()

async def fetch_quote(symbol: str) -> dict[str, Any]:
    """Latest quote from Yahoo Finance; uses 2s internal cache to prevent hammering."""
    symbol_key = symbol.upper()
    async with _cache_lock:
        cached = _quote_cache.get(symbol_key)
        if cached:
            ts = datetime.fromisoformat(cached["timestamp"])
            if (datetime.now() - ts).total_seconds() < 2:
                return cached

    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(None, _sync_fetch_quote, symbol)
    if data is None:
        data = _mock_quote(symbol)
    
    async with _cache_lock:
        _quote_cache[symbol_key] = data
    return data

def _sync_fetch_historical_ohlc(
    symbol: str,
    interval: str = "1minute",
    days: int = 30,
) -> list[dict[str, Any]] | None:
    try:
        yf_interval = _map_interval(interval)
        t = yf.Ticker(_yahoo_ticker(symbol))
        
        if yf_interval == "1m":
            # If 1m, we might need to look back further if market is closed
            # Yahoo 1m is only available for 7 days.
            search_days = min(max(days, 2), 7)
            hist = t.history(period=f"{search_days}d", interval="1m", auto_adjust=True)
            
            # If empty, try fetching with a larger period just in case
            if hist.empty and search_days < 7:
                hist = t.history(period="7d", interval="1m", auto_adjust=True)
        else:
            hist = t.history(period=f"{min(max(days, 1), 730)}d", interval="1d", auto_adjust=True)
            
        if hist.empty:
            return None
            
        out: list[dict[str, Any]] = []
        for idx, row in hist.iterrows():
            ts = idx
            if hasattr(ts, "timestamp"):
                tsec = int(ts.timestamp())
            else:
                tsec = int(datetime.now().timestamp())
            vol = row["Volume"]
            out.append({
                "time": tsec,
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(vol) if vol == vol else 0,
            })
        return out
    except Exception as exc:
        logger.warning("yfinance OHLC failed for %s: %s", symbol, exc)
        return None

async def fetch_historical_ohlc(
    symbol: str,
    interval: str = "1minute",
    days: int = 30,
) -> list[dict[str, Any]]:
    """Historical OHLC from Yahoo Finance; mock on failure."""
    loop = asyncio.get_running_loop()
    data = await loop.run_in_executor(
        None,
        lambda: _sync_fetch_historical_ohlc(symbol, interval, days),
    )
    if data is None or len(data) < 20:
        n = days * 375 if interval == "1minute" else max(days, 60)
        return _mock_ohlc(symbol, min(n, 500))
    return data

def _mock_quote(symbol: str) -> dict[str, Any]:
    base = _symbol_base_price(symbol)
    change = random.uniform(-2.5, 2.5)
    ltp = round(base * (1 + change / 100), 2)
    return {
        "symbol": symbol,
        "ltp": ltp,
        "open": round(base * random.uniform(0.98, 1.01), 2),
        "high": round(ltp * random.uniform(1.00, 1.03), 2),
        "low": round(ltp * random.uniform(0.97, 1.00), 2),
        "close": round(base, 2),
        "volume": random.randint(50_000, 5_000_000),
        "change_pct": round(change, 2),
        "bid": round(ltp - 0.05, 2),
        "ask": round(ltp + 0.05, 2),
        "timestamp": datetime.now().isoformat(),
        "is_mock": True,
    }

def _mock_ohlc(symbol: str, candles: int = 100) -> list[dict[str, Any]]:
    base = _symbol_base_price(symbol)
    result = []
    price = base
    now_ts = int(datetime.now().timestamp())
    for i in range(candles, 0, -1):
        change = random.uniform(-1.5, 1.5)
        open_ = round(price, 2)
        close = round(price * (1 + change / 100), 2)
        high = round(max(open_, close) * random.uniform(1.001, 1.015), 2)
        low = round(min(open_, close) * random.uniform(0.985, 0.999), 2)
        result.append({
            "time": now_ts - i * 60,
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": random.randint(10_000, 500_000),
        })
        price = close
    return result

def _symbol_base_price(symbol: str) -> float:
    prices = {
        "^NSEI": 24200, "^BSESN": 79400, "^NSEBANK": 52300, "^CNXIT": 38100,
        "RELIANCE": 2850, "TCS": 4100, "HDFCBANK": 1680, "INFY": 1780,
        "ICICIBANK": 1250, "KOTAKBANK": 1890, "BHARTIARTL": 1620,
        "ITC": 465, "AXISBANK": 1180, "LT": 3700, "MARUTI": 12800,
        "TITAN": 3580, "BAJFINANCE": 7200, "SUNPHARMA": 1890,
        "HCLTECH": 1920, "WIPRO": 560, "NESTLEIND": 2450,
        "ASIANPAINT": 2980, "ULTRACEMCO": 11400, "HINDUNILVR": 2680,
    }
    s = symbol.split(".")[0].upper()
    return prices.get(s, random.uniform(500, 3000))

async def get_market_status() -> dict[str, Any]:
    """Check if Indian market (NSE) is currently open (regular session, IST)."""
    ist = ZoneInfo("Asia/Kolkata")
    now = datetime.now(ist)
    weekday = now.weekday()
    total_minutes = now.hour * 60 + now.minute

    is_open = (
        weekday < 5
        and 9 * 60 + 15 <= total_minutes <= 15 * 60 + 30
    )
    return {
        "is_open": is_open,
        "session": "Regular" if is_open else "Closed",
        "timestamp": now.isoformat(),
        "timezone": "Asia/Kolkata",
        "note": "NSE regular session 09:15–15:30 IST, Mon–Fri",
        "data_source_note": (
            "Quotes use Yahoo Finance (yfinance). Data is often delayed vs the exchange "
            "(commonly ~15 minutes for NSE on free feeds). The WebSocket refreshes that "
            "delayed quote about once per second — it is not tick-by-tick exchange data. "
            "For true live ticks, integrate a broker API (e.g. Kite Connect)."
        ),
    }
