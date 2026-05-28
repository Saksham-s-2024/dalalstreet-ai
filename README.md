# 🏛️ DalalStreet AI — Indian Market Intelligence Platform

> AI-powered intraday risk assessment and long-term investment recommendations for the Indian stock market (NSE/BSE).

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)](https://python.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Security](#security)
- [Architecture](#architecture)
- [Development Roadmap](#development-roadmap)
- [Disclaimer](#disclaimer)

---

## Overview

DalalStreet AI is a **3rd-year capstone project** that provides actionable market insights for two kinds of users:

| Mode | User | Use Case |
|------|------|----------|
| **⚡ Trader Mode** | Active intraday traders | Real-time risk assessment for a specific stock at a specific timestamp |
| **📈 Investor Mode** | Retail / layman investor | Long-term recommendations across Mutual Funds, ETFs, Large Cap & Small Cap |

The platform loads market data via **yfinance** (Yahoo Finance), processes technical indicators in real-time, and uses an **MLPRegressor + rule engine** for risk scores and BUY/SELL/HOLD/AVOID reports. Features include parallelized report generation and a centralized WebSocket broadcasting engine.

---

## Features

### ⚡ Trader Mode
- **Punch-In Button** — triggers an instant AI risk assessment for the selected symbol at the current timestamp
- **Live WebSocket price feed** — optimized multi-broadcast engine with reconnection logic
- **TradingView Lightweight Charts** — professional candlestick charts with live tick updates
- **Stock Comparison Engine** — side-by-side analysis of two symbols with head-to-head delta analysis
- **Technical Analysis** — RSI (14), VWAP (intraday), Bollinger Bands, 52-week high/low
- **AI Risk Report** — Decision (BUY/SELL/HOLD/AVOID), Risk Score (0–100), Confidence %, entry/SL/target prices, key signals, warnings
- **Market open/close detection** — warns user when NSE is closed

### 📈 Investor Mode
- **Asset type selector** — Large Cap, Small Cap, ETFs, Mutual Funds
- **Risk appetite** — LOW / MODERATE / HIGH
- **Systematic ETF Alpha Signals** — Median-based buy-the-dip detection for ETFs
- **Market Vitals Grid** — Real-time sectoral performance tracking (Nifty 50, IT, Bank, etc.)
- **Parallel Analysis** — High-speed parallel fetching and AI analysis for multiple assets
- **AI Recommendation Report** — Top 3–5 picks with rationale, expected returns, SIP suitability, allocation %
- **India-specific** — LTCG/STCG tax notes, SEBI-style risk warnings, diversification tips

### 🔧 Platform Features
- **Redis report cache + distributed lock** — prevents duplicate AI calls
- **Rate-limited API endpoints** — per-IP limits on all routes
- **Input sanitization** — all user inputs sanitized, max length enforced
- **Flat Premium UI** — gradient-free minimalist design with a "Live" status indicator and auto-reconnect logic
- **SEBI disclaimer** — financial advisory disclaimer on all pages

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, Tailwind CSS, Framer Motion, TradingView Lightweight Charts, Zustand |
| **Backend** | Python 3.12, FastAPI (async), WebSockets |
| **AI / signals** | scikit-learn `MLPRegressor` + rule-based levels |
| **Market Data** | yfinance (Yahoo Finance; optional Kite in config for other features) |
| **Database** | TimescaleDB (time-series OHLC) + PostgreSQL (user data) |
| **Cache / Queue** | Redis Pub/Sub + Celery |
| **Auth** | JWT (python-jose) |
| **Rate Limiting** | SlowAPI (per-IP, per-route) |
| **Containerisation** | Docker + Docker Compose |

---

## Project Structure

```
dalalstreet-ai/
│
├── .env.example              # Template — copy to .env and fill in keys
├── .gitignore                # .env files are gitignored
├── docker-compose.yml        # Full stack orchestration
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py           # FastAPI app + WebSocket endpoint
│       ├── core/
│       │   ├── config.py     # Settings loaded from .env (never hardcoded)
│       │   └── security.py   # JWT, HMAC, input sanitization
│       ├── api/
│       │   └── routes.py     # Rate-limited API endpoints
│       └── services/
│           ├── market_data.py   # yfinance quotes/OHLC + mock fallback
│           ├── ai_reports.py    # MLP + rule-based report generation
│           └── report_cache.py  # Redis cache + distributed lock
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tailwind.config.js
│   └── src/
│       ├── app/
│       │   ├── layout.tsx    # Root layout with IBM Plex Mono font
│       │   ├── globals.css   # Global dark theme styles
│       │   └── page.tsx      # Main app (Trader + Investor modes)
│       └── store/
│           └── appStore.ts   # Zustand global state
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker & Docker Compose (recommended)
- Redis (or use Docker)
- PostgreSQL with TimescaleDB extension (or use Docker)

---

### Option A — Docker Compose (Recommended)

```bash
# 1. Clone the repo
git clone https://github.com/your-username/dalalstreet-ai.git
cd dalalstreet-ai

# 2. Set up environment
cp .env.example .env
# Edit .env with your API keys (see Environment Variables section)

# 3. Start everything
docker-compose up --build

# App will be running at:
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API Docs:  http://localhost:8000/docs  (development only)
```

---

### Option B — Manual Setup

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Make sure Redis is running locally
# Start the API
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your keys. **Never commit `.env` to git** — it is gitignored.

| Variable | Description | Required |
|----------|-------------|----------|
| `KITE_API_KEY` | Zerodha Kite Connect key (optional broker features) | Optional |
| `ANTHROPIC_API_KEY` | Legacy env key; reports use local ML, not Anthropic | Optional |
| `JWT_SECRET_KEY` | Secret for JWT signing | Yes |
| `APP_SECRET_KEY` | HMAC signing secret | Yes |
| `POSTGRES_PASSWORD` | Database password | Yes |
| `REDIS_URL` | Redis connection string | Yes |

> 💡 **Mock mode**: If yfinance returns no data (network/symbol error), quotes and OHLC fall back to simulated mock prices.

---

## API Reference

All endpoints are rate-limited per IP. Base URL: `http://localhost:8000/api/v1`

### Market Data

| Method | Endpoint | Rate Limit | Description |
|--------|----------|------------|-------------|
| GET | `/market/status` | 30/min | NSE open/closed status |
| GET | `/market/symbols` | 20/min | List of Nifty 50 symbols |
| GET | `/market/quote/{symbol}` | 60/min | Real-time quote |
| GET | `/market/ohlc/{symbol}` | 20/min | Historical OHLC candles |

### Trader Mode

| Method | Endpoint | Rate Limit | Body |
|--------|----------|------------|------|
| POST | `/trader/report` | 10/min | `{ symbol, timestamp? }` |

### Investor Mode

| Method | Endpoint | Rate Limit | Body |
|--------|----------|------------|------|
| POST | `/investor/report` | 5/min | `{ asset_type, risk_appetite, symbols? }` |

### WebSocket

```
ws://localhost:8000/ws/market/{SYMBOL}
```
Streams live quote JSON every second while connection is open.

---

## Security

### 1. Secrets in Environment Variables
All API keys, database passwords, JWT secrets, and HMAC keys are stored in `.env` (gitignored). The app reads them via `pydantic-settings` — never hardcoded in source code.

### 2. Rate Limiting
Every endpoint is decorated with `@limiter.limit(...)` using SlowAPI. Limits are configurable via `.env`:
- Market quotes: 60 req/min
- Trader reports: 10 req/min
- Investor reports: 5 req/min

### 3. Input Sanitization
All user-supplied inputs go through `app/core/security.py`:
- **Symbol**: regex validated, max 20 chars, uppercase only
- **Free text**: HTML tags, control characters, and dangerous characters stripped, max 200 chars
- **Lists**: max 10 items per request

### 4. HMAC Payload Signing
Communication between frontend and AI backend is HMAC-SHA256 signed using the `APP_SECRET_KEY` to prevent tampering.

### 5. JWT Authentication
All protected routes require a valid JWT. Tokens expire in 30 minutes (configurable).

### 6. WebSocket Security
- Symbol is regex-validated before accepting the WebSocket connection
- Invalid symbols result in `close(1008)` (policy violation)

---

## Architecture

```
User Browser
     │
     ├── HTTP REST ──→ Next.js Frontend ──→ FastAPI Backend ──→ Redis Cache
     │                                             │
     ├── WebSocket ──→ /ws/market/{symbol} ────→  │ ──→ yfinance (poll quote)
     │                                             │
     └── Report Request ─────────────────────────→  │ ──→ MLP + rules (local)
                                                   │
                                            TimescaleDB (OHLC history)
```

### Report Deduplication Flow
```
Request → Check Redis Cache → HIT? → Return cached report
                           → MISS → Try acquire lock
                                        → LOCKED (another request in progress)
                                              → Poll cache for 10s
                                        → ACQUIRED
                                              → Fetch market data
                                              → Generate report (MLP + rules)
                                              → Store in Redis (TTL: 5min trader, 1hr investor)
                                              → Release lock
                                              → Return report
```

---

## Development Roadmap

Based on the PRD phases:

- [x] **Phase 1 — Data**: yfinance OHLC and quotes, mock data fallback
- [x] **Phase 2 — AI**: MLPRegressor + rule engine, technical indicators, systematic ETF signals
- [x] **Phase 3 — Frontend**: Mode switch, TradingView charts, live WebSocket updates, flat design
- [x] **Phase 4 — Security**: JWT auth, HMAC signing, rate limiting, input sanitization
- [x] **Phase 5 — Optimization**: Parallel report generation, optimized WebSocket broadcasting
- [ ] **Future**: TimescaleDB hypertables for OHLC storage, Celery background tasks, LSTM model training

---

## Disclaimer

> ⚠️ **DalalStreet AI is a student project for educational purposes only.** It is NOT registered with SEBI as an investment advisor. All AI-generated reports are for informational purposes and do not constitute financial advice. Past performance is not indicative of future results. Please consult a SEBI-registered financial advisor before making investment decisions. The developers are not responsible for any financial losses incurred through the use of this platform.

---

*Built with ❤️ as a 3rd year Computer Science project | DalalStreet AI v2.0*
