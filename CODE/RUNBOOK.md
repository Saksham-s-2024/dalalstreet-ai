# DalalStreet AI — Runbook (local and online)

## What you need running

1. **PostgreSQL** — required for **login, registration, and saved report history**. Set `DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:5432/DBNAME` in `.env`.
2. **Redis** — used for report caching. Set `REDIS_URL` (default `redis://localhost:6379/0`).
3. **Backend** — FastAPI on port **8000**.
4. **Frontend** — Next.js on port **3000**, with `NEXT_PUBLIC_API_URL` pointing at the API (see below).

Optional: **Docker Compose** starts Postgres (Timescale image), Redis, backend, frontend, and a Celery worker (idle until you add tasks).

---

## Run locally (Windows / PowerShell)

From the `dalalstreet-ai` folder:

1. Copy `.env.example` → `.env` and fill `POSTGRES_*`, `DATABASE_URL`, `JWT_SECRET_KEY`, `REDIS_URL`.
2. Start **PostgreSQL** and **Redis** (or `docker compose up -d db redis`).
3. Backend:

   ```powershell
   cd backend
   .\run_dev.ps1
   ```

4. Frontend (new terminal):

   ```powershell
   cd frontend
   .\run_dev.ps1
   ```

5. Open **http://localhost:3000** → you are sent to **login**. Register or sign in, then use the dashboard.

6. **Saved reports**: `/reports` lists every trader/investor report generated **while logged in** (with IST timestamps). Reports are written to table `report_archives` when you call the report APIs with a valid `Authorization: Bearer` token (the app does this automatically after login).

---

## Put the app “online” (production-style)

1. Run the stack on a **VPS or cloud VM** (or managed containers) with a public hostname.
2. Serve the **frontend** over **HTTPS** (e.g. reverse proxy: Nginx, Caddy, or a PaaS).
3. Serve the **API** over **HTTPS** on a stable URL, e.g. `https://api.yourdomain.com`.
4. In the **frontend** build environment, set:

   `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`

5. In the **backend** `.env`, set:

   `ALLOWED_ORIGINS=https://yourdomain.com`  
   (comma-separated if you have several origins.)

6. Use **strong** secrets: `JWT_SECRET_KEY`, `APP_SECRET_KEY`.
7. For **WebSockets** through a proxy, enable HTTP/1.1 upgrade support (e.g. Nginx `proxy_set_header Upgrade $http_upgrade;` and `Connection "upgrade"` for `/ws/`).

**Docker Compose note:** `NEXT_PUBLIC_API_URL: http://localhost:8000` is only correct when the **browser** runs on the same machine as the stack. For real users, rebuild the frontend with their public API URL.

---

## Health Checks & Maintenance

### Redis Cache Health
To ensure the report cache is functioning optimally, run:
```bash
redis-cli -h localhost -p 6379 info memory
```
*Target*: `used_memory_human` should be low (e.g., < 10MB) for typical usage. `maxmemory_policy` should be `noeviction` or `allkeys-lru`.

### Backend Performance
The investor report engine is now **parallelized**. It fetches data for up to 5 symbols simultaneously. If latency increases:
1. Check network connectivity to Yahoo Finance.
2. Verify Redis distributed locks aren't stale.

### Connectivity Status
The dashboard features a **Live/Reconnecting** indicator in the header.
- **Live (Green)**: Active WebSocket connection to the backend broadcasting engine.
- **Reconnecting (Red)**: WebSocket disconnected; auto-reconnect logic will trigger every 3 seconds.

---

## Live market data at 9:15 IST

- **NSE open/closed** in the UI uses **Asia/Kolkata** (fixed in the API), so it is correct even if the server is in UTC.
- **Prices** come from **Yahoo Finance via yfinance**, not from the exchange directly.
- **Broadcasting Engine**: The backend maintains one task per symbol regardless of client count, reducing network overhead.
- During market hours you will usually see **updated** values, but they are often **delayed** (commonly on the order of **~15 minutes** on free Yahoo data for NSE). The WebSocket **polls** that source about once per second — it does **not** provide true tick-by-tick exchange feed.

**To get real-time or near–real-time data**, integrate a **broker API** (e.g. **Zerodha Kite Connect** — credentials in `.env` as `KITE_*`) and extend `market_data.py` / the WebSocket path to use that feed instead of (or as fallback to) yfinance.

If you see **`is_mock: true`** in quote JSON, yfinance failed; check symbol (use NSE symbols as `SYMBOL.NS` internally), network, and rate limits.

---

## API quick reference

| Endpoint | Auth |
|----------|------|
| `POST /api/v1/auth/register` | No |
| `POST /api/v1/auth/login` | No |
| `GET /api/v1/auth/me` | Bearer JWT |
| `GET /api/v1/reports/history` | Bearer JWT |
| `POST /api/v1/trader/report` | Optional Bearer (required to **save** history) |
| `POST /api/v1/investor/report` | Optional Bearer (required to **save** history) |
| `GET /api/v1/market/quote/{symbol}` | No |
| `WS /ws/market/{symbol}` | No |

Open **http://localhost:8000/docs** in development for interactive API docs.
