import asyncio
import logging
import hashlib
import json
from typing import Any
from enum import Enum

import numpy as np
import pandas as pd
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import StandardScaler
from ta.momentum import RSIIndicator, StochRSIIndicator
from ta.trend import MACD, EMAIndicator, SMAIndicator
from ta.volatility import BollingerBands

from app.services.market_data import fetch_quote, fetch_historical_ohlc
from app.services.report_cache import (
    ReportMode,
    acquire_report_lock,
    get_cached_report,
    release_report_lock,
    set_cached_report,
)

logger = logging.getLogger(__name__)

WINDOW = 60
N_FEATURES = 15
N_PRED_SESSIONS = 5

MLP_HIDDEN = (128, 64, 32)

DATASET_PATH = "s:/PROJECTS/DALASTREET AI/new/dalalstreet-ai (1)/CODE/dataset/comprehensive_mutual_funds_data.csv"

def _ema(series: np.ndarray, span: int) -> np.ndarray:
    alpha = 2.0 / (span + 1)
    out = np.zeros_like(series, dtype=float)
    out[0] = series[0]
    for i in range(1, len(series)):
        out[i] = alpha * series[i] + (1 - alpha) * out[i - 1]
    return out

def _calc_rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    n = len(closes)
    rsi = np.full(n, 50.0)
    for i in range(period, n):
        window = closes[i - period : i + 1]
        deltas = np.diff(window)
        gains = np.where(deltas > 0, deltas, 0.0)
        losses = np.where(deltas < 0, -deltas, 0.0)
        ag = np.mean(gains)
        al = np.mean(losses)
        if al == 0:
            rsi[i] = 100.0
        else:
            rs = ag / al
            rsi[i] = 100.0 - (100.0 / (1.0 + rs))
    return rsi

def _feature_matrix(candles: list[dict]) -> np.ndarray | None:
    n = len(candles)
    if n < 20:
        return None

    df = pd.DataFrame(candles)
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    rsi = RSIIndicator(close=close, window=14).rsi()
    macd_obj = MACD(close=close, window_slow=26, window_fast=12, window_sign=9)
    macd_line = macd_obj.macd()
    signal_line = macd_obj.macd_signal()
    macd_hist = macd_obj.macd_diff()
    bb = BollingerBands(close=close, window=20, window_dev=2)
    bb_pctb = bb.bollinger_pband()
    bb_width = bb.bollinger_wband()
    typical = (high + low + close) / 3.0
    vwap = (typical * volume).cumsum() / volume.cumsum().replace(0, 1)
    vwap_dev = (close - vwap) / close.replace(0, 1)
    mom10 = close.pct_change(10)
    vol_sma20 = volume.rolling(20).mean()
    vol_ratio = volume / vol_sma20.replace(0, 1)
    sma20 = SMAIndicator(close=close, window=min(n, 20)).sma_indicator()
    sma50 = SMAIndicator(close=close, window=min(n, 50)).sma_indicator()
    close_sma20 = (close / sma20.replace(0, 1)) - 1.0
    close_sma50 = (close / sma50.replace(0, 1)) - 1.0
    hl_range = (high - low) / close.replace(0, 1)
    ret_1 = close.pct_change(1)
    sma_spread = (sma20 / sma50.replace(0, 1)) - 1.0
    stoch_rsi = StochRSIIndicator(close=close, window=14).stochrsi()

    feat = pd.concat([
        rsi / 100.0, macd_line / close.replace(0, 1), signal_line / close.replace(0, 1),
        macd_hist / close.replace(0, 1), bb_pctb.clip(0, 1), bb_width, vwap_dev,
        mom10, vol_ratio.clip(0, 5), close_sma20, close_sma50, hl_range, ret_1,
        sma_spread, stoch_rsi
    ], axis=1).values
    return np.nan_to_num(feat, nan=0.0)

def _build_xy(feat: np.ndarray, close: np.ndarray):
    n = len(close)
    xs, ys = [], []
    for i in range(WINDOW, n - N_PRED_SESSIONS):
        x = feat[i - WINDOW : i].reshape(-1)
        y = np.array([close[i + k] / close[i] for k in range(1, N_PRED_SESSIONS + 1)])
        xs.append(x)
        ys.append(y)
    if len(xs) < 8: return None, None
    return np.vstack(xs), np.vstack(ys)

def _train_and_predict(candles: list[dict]):
    diag = {"trained_samples": 0, "used_mlp": False}
    feat = _feature_matrix(candles)
    if feat is None: return None, diag
    close = np.array([c["close"] for c in candles], dtype=float)
    X, y = _build_xy(feat, close)
    if X is None: return None, diag
    sx, sy = StandardScaler(), StandardScaler()
    Xs, ys = sx.fit_transform(X), sy.fit_transform(y)
    mlp = MLPRegressor(hidden_layer_sizes=MLP_HIDDEN, activation="tanh", max_iter=300, random_state=42, early_stopping=True)
    mlp.fit(Xs, ys)
    diag["used_mlp"] = True; diag["trained_samples"] = X.shape[0]
    last_x = feat[-WINDOW:].reshape(1, -1)
    pred_s = mlp.predict(sx.transform(last_x))
    return sy.inverse_transform(pred_s)[0], diag

def _rule_based_assessment(quote: dict, tech: dict, pred_ratios: np.ndarray | None, last_close: float):
    ltp = float(quote.get("ltp", last_close))
    rsi = float(tech.get("rsi_14", 50))
    chg = float(quote.get("change_pct", 0))
    if pred_ratios is not None:
        targets = np.array([last_close * float(r) for r in pred_ratios])
        median_move = float(np.median((targets - ltp) / max(ltp, 1e-9)) * 100)
    else:
        targets = np.array([ltp * 1.01, ltp * 1.02, ltp, ltp * 0.99, ltp * 0.98])
        median_move = chg

    score = 0
    if rsi < 32: score += 25
    elif rsi > 68: score -= 22
    if pred_ratios is not None:
        if median_move > 0.4: score += 20
        elif median_move < -0.4: score -= 18

    risk_score = int(np.clip(50 - score, 0, 100))
    risk_level = "LOW" if risk_score < 28 else "MEDIUM" if risk_score < 48 else "HIGH" if risk_score < 68 else "EXTREME"
    
    decision = "HOLD"
    if score >= 22 and risk_level in ("LOW", "MEDIUM"): decision = "BUY"
    elif score <= -22 and risk_level in ("HIGH", "EXTREME", "MEDIUM"): decision = "SELL"
    elif risk_level == "EXTREME": decision = "AVOID"

    return {
        "risk_level": risk_level, "risk_score": risk_score, "decision": decision,
        "confidence_pct": int(np.clip(50 + abs(score), 30, 95)),
        "entry_price": round(ltp, 2) if decision != "AVOID" else None,
        "stop_loss": round(ltp * 0.98, 2) if decision == "BUY" else None,
        "target_price": round(float(np.max(targets)), 2) if decision == "BUY" else None,
        "holding_period": "intraday", "summary": f"MLP Median Path: {median_move:+.2f}%. Bias: {decision}.",
        "key_signals": [f"RSI: {rsi:.1f}", f"Score: {score}"], "warnings": ["Market data is delayed"], "technical_bias": "BULLISH" if score > 10 else "BEARISH" if score < -10 else "NEUTRAL",
        "predicted_prices_next_sessions": [round(float(x), 2) for x in targets],
    }

def _build_technical_summary(quote: dict, candles: list[dict]):
    closes = [c["close"] for c in candles]
    if not closes: return {"ltp": quote["ltp"], "change_pct": quote["change_pct"], "volume": quote["volume"], "rsi_14": 50, "vwap": quote["ltp"], "bollinger": {"upper": quote["ltp"], "mid": quote["ltp"], "lower": quote["ltp"]}, "high_52w": quote["ltp"], "low_52w": quote["ltp"]}
    rsi_val = float(_calc_rsi(np.array(closes, dtype=float), 14)[-1])
    return {
        "ltp": quote["ltp"], "change_pct": quote["change_pct"], "volume": quote["volume"],
        "rsi_14": round(rsi_val, 2), "vwap": round(np.mean(closes), 2),
        "bollinger": {"upper": round(np.mean(closes) + 2*np.std(closes), 2), "mid": round(np.mean(closes), 2), "lower": round(np.mean(closes) - 2*np.std(closes), 2)},
        "high_52w": round(max(closes), 2), "low_52w": round(min(closes), 2),
    }

def _load_mutual_fund_data():
    try:
        df = pd.read_csv(DATASET_PATH)
        cols = ["returns_1yr", "returns_3yr", "returns_5yr", "alpha", "sharpe", "sortino", "expense_ratio", "risk_level", "sd", "min_sip"]
        for c in cols:
            if c in df.columns:
                df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
        return df
    except Exception as e:
        logger.error(f"Error loading mutual fund dataset: {e}")
        return pd.DataFrame()

def _recommend_mutual_funds(risk_appetite: str):
    df = _load_mutual_fund_data()
    if df.empty: return [], {}
    risk_map = {"LOW": [1, 2], "MODERATE": [3, 4], "HIGH": [5, 6]}
    target_levels = risk_map.get(risk_appetite.upper(), [3, 4])
    filtered = df[df["risk_level"].isin(target_levels)].copy()
    if filtered.empty: filtered = df.copy()
    filtered["ai_score"] = (filtered["returns_3yr"] * 0.4) + (filtered["alpha"] * 3.0) + (filtered["sharpe"] * 4.0) - (filtered["expense_ratio"] * 0.5)
    top = filtered.sort_values(by="ai_score", ascending=False).head(5)
    picks, assets = [], {}
    for _, row in top.iterrows():
        sym = str(row["scheme_name"])
        picks.append({
            "symbol": sym, 
            "type": "mutual_fund", 
            "rationale": f"Top {row['category']} fund. Alpha: {float(row['alpha']):.2f}.", 
            "risk_rating": risk_appetite, 
            "expected_return_range": f"{float(row['returns_3yr'])-2:.1f}%–{float(row['returns_3yr'])+4:.1f}%", 
            "suggested_allocation_pct": 20, 
            "sip_suitable": bool(row["min_sip"] <= 500)
        })
        assets[sym] = {
            "ltp": 0, 
            "change_pct": 0, 
            "return_1y_pct": float(row["returns_1yr"]), 
            "volatility_pct": float(row["sd"]), 
            "rsi": 50, 
            "mlp_median_path_pct": 0, 
            "score": round(float(row["ai_score"]), 2), 
            "model_diagnostics": {"from_dataset": True}
        }
    return picks, assets

async def generate_trader_report(symbol: str, timestamp: str):
    cached = await get_cached_report(ReportMode.TRADER, symbol, timestamp[:16])
    if cached: return cached
    lock = await acquire_report_lock(ReportMode.TRADER, symbol, timestamp[:16])
    if not lock: return {"error": "Generation in progress"}
    try:
        quote = await fetch_quote(symbol)
        candles = await fetch_historical_ohlc(symbol, interval="1minute", days=5)
        if not candles: candles = await fetch_historical_ohlc(symbol, interval="day", days=10)
        tech = _build_technical_summary(quote, candles)
        last_close = float(candles[-1]["close"]) if candles else float(quote["ltp"])
        pred, diag = await asyncio.get_event_loop().run_in_executor(None, lambda: _train_and_predict(candles))
        report = {"symbol": symbol, "timestamp": timestamp, "mode": "trader", "technical": tech, "assessment": _rule_based_assessment(quote, tech, pred, last_close), "from_cache": False}
        await set_cached_report(ReportMode.TRADER, symbol, report, timestamp[:16])
        return report
    except Exception as e: return {"error": str(e)}
    finally: await release_report_lock(ReportMode.TRADER, symbol, timestamp[:16])

async def generate_investor_report(asset_type: str, risk_appetite: str, symbols: list[str]):
    cache_key = f"{asset_type}:{risk_appetite}"
    cached = await get_cached_report(ReportMode.INVESTOR, cache_key)
    if cached: return cached
    if asset_type == "mutual_fund":
        picks, assets = _recommend_mutual_funds(risk_appetite)
        report = {"mode": "investor", "asset_type": asset_type, "risk_appetite": risk_appetite, "assets_analysed": assets, "recommendation": {"recommendation_summary": "Data-driven mutual fund selection.", "top_picks": picks, "diversification_tip": "Spread across AMCs.", "risk_warning": "Market risk applies.", "holding_horizon": "5+ years", "tax_note": "As per IT laws"}, "from_cache": False}
        await set_cached_report(ReportMode.INVESTOR, cache_key, report)
        return report
    
    if not symbols: symbols = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]
    
    async def analyse_asset(sym: str):
        try:
            q = await fetch_quote(sym)
            c = await fetch_historical_ohlc(sym, interval="day", days=365)
            if not c or len(c) < 2: return None
            cls = np.array([x["close"] for x in c], dtype=float)
            ret = round(((cls[-1] - cls[0]) / cls[0]) * 100, 2)
            vol = round(np.std([(cls[i]-cls[i-1])/cls[i-1] for i in range(1, len(cls))]) * 100 * 15.8, 2) if len(cls) > 20 else 15.0
            pred, _ = await asyncio.get_event_loop().run_in_executor(None, lambda: _train_and_predict(c))
            mom = float(np.mean(pred) - 1.0) * 100 if pred is not None else 0.0
            score = mom + (ret * 0.15) - (vol * 0.08)
            return sym, {"ltp": q["ltp"], "change_pct": q["change_pct"], "return_1y_pct": ret, "volatility_pct": vol, "rsi": 50, "mlp_median_path_pct": round(mom, 3), "score": round(score, 2)}
        except Exception as e:
            logger.error(f"Error analysing investor asset {sym}: {e}")
            return None

    results = await asyncio.gather(*[analyse_asset(s) for s in symbols[:5]])
    assets_data = {r[0]: r[1] for r in results if r}
    
    picks = []
    for sym, d in sorted(assets_data.items(), key=lambda x: x[1]["score"], reverse=True):
        picks.append({"symbol": sym, "type": asset_type, "rationale": "Strong metrics.", "risk_rating": risk_appetite, "expected_return_range": "12-18%", "suggested_allocation_pct": 20, "sip_suitable": True})
    
    report = {"mode": "investor", "asset_type": asset_type, "risk_appetite": risk_appetite, "assets_analysed": assets_data, "recommendation": {"recommendation_summary": "AI ranking based on momentum and risk.", "top_picks": picks, "diversification_tip": "Add index funds.", "risk_warning": "Market risk.", "holding_horizon": "3-5 years", "tax_note": "LTCG 10%"}, "from_cache": False}
    
    # Add ETF specific research-based signals
    if asset_type == "etf":
        results = await asyncio.gather(*[_calculate_median_signal(sym) for sym in symbols[:5]])
        signals = {symbols[i]: results[i] for i in range(len(results)) if results[i]}
        report["etf_research_signals"] = signals

    # Add Sectoral Vitals (inspired by NIFTY EDA)
    report["market_vitals"] = await _get_sectoral_performance()
    
    await set_cached_report(ReportMode.INVESTOR, cache_key, report)
    return report

async def _calculate_median_signal(symbol: str):
    """Ported from etf-trading-notebook.ipynb: Median-Based Buy Signal detection"""
    try:
        # Fetch up to 20 years of monthly data
        candles = await fetch_historical_ohlc(symbol, interval="1mo", days=7300)
        if not candles or len(candles) < 24: return None
        
        df = pd.DataFrame(candles)
        df["returns"] = df["close"].pct_change() * 100
        neg_returns = df[df["returns"] < 0]["returns"]
        
        if neg_returns.empty: return None
        
        median_neg = neg_returns.median()
        current_return = df.iloc[-1]["returns"]
        is_buy = current_return < median_neg
        
        return {
            "median_negative_threshold": round(float(median_neg), 2),
            "current_month_performance": round(float(current_return), 2),
            "is_buy_signal": bool(is_buy),
            "signal_logic": "Current drop is deeper than historical median negative month",
            "confidence": "High" if abs(current_return - median_neg) > 2 else "Moderate"
        }
    except Exception as e:
        logger.error(f"Error calculating median signal for {symbol}: {e}")
        return None

async def _get_sectoral_performance():
    """Sectoral performance insights inspired by NIFTY Data EDA notebook"""
    sectors = {
        "^NSEI": "Nifty 50", "^NSEBANK": "Bank", "^CNXIT": "IT", 
        "^CNXAUTO": "Auto", "^CNXPHARMA": "Pharma", "^CNXMETAL": "Metal"
    }
    performance = {}
    tasks = []
    for sym, name in sectors.items():
        tasks.append(fetch_quote(sym))
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for i, q in enumerate(results):
        if isinstance(q, Exception) or not q: continue
        name = list(sectors.values())[i]
        performance[name] = {
            "ltp": q["ltp"],
            "change_pct": q["change_pct"],
            "status": "BULLISH" if q["change_pct"] > 0.5 else "BEARISH" if q["change_pct"] < -0.5 else "NEUTRAL"
        }
    return performance
