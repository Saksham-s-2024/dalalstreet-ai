import logging

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.api import auth
from app.api.routes import router
from app.core.config import settings
from app.core.database import check_database_connection
from app.core.init_db import init_db
from app.core.rate_limit import limiter
from app.services.market_data import fetch_quote

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs" if settings.app_env == "development" else None,
    redoc_url=None,
)

# ── Rate Limiting ─────────────────────────────────────────────
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── CORS ──────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────
app.include_router(router)
app.include_router(auth.router)


# ── WebSocket — Live Price Feed ───────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = {}
        self.tasks: dict[str, asyncio.Task] = {}

    async def connect(self, symbol: str, ws: WebSocket):
        await ws.accept()
        self.active.setdefault(symbol, []).append(ws)
        logger.info("WS connected: %s (total: %d)", symbol, len(self.active[symbol]))
        
        if symbol not in self.tasks or self.tasks[symbol].done():
            self.tasks[symbol] = asyncio.create_task(self._stream_symbol(symbol))

    def disconnect(self, symbol: str, ws: WebSocket):
        if symbol in self.active:
            self.active[symbol] = [w for w in self.active[symbol] if w != ws]
            if not self.active[symbol]:
                if symbol in self.tasks:
                    self.tasks[symbol].cancel()
                    del self.tasks[symbol]
                del self.active[symbol]

    async def _stream_symbol(self, symbol: str):
        try:
            while True:
                quote = await fetch_quote(symbol)
                await self.broadcast(symbol, quote)
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Error streaming %s: %s", symbol, e)

    async def broadcast(self, symbol: str, data: dict):
        if symbol not in self.active: return
        dead = []
        for ws in self.active[symbol]:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(symbol, ws)


manager = ConnectionManager()


@app.websocket("/ws/market/{symbol}")
async def websocket_market(websocket: WebSocket, symbol: str):
    # Sanitize symbol from URL
    import re
    symbol = symbol.strip().upper()[:20]
    if not re.match(r"^[A-Z0-9\-&\.]{1,20}$", symbol):
        await websocket.close(code=1008)
        return

    await manager.connect(symbol, websocket)
    try:
        while True:
            # Keep connection alive; messages are sent via manager.broadcast
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(symbol, websocket)
    except Exception:
        manager.disconnect(symbol, websocket)


# ── Global Exception Handler ──────────────────────────────────
@app.exception_handler(Exception)
async def global_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.on_event("startup")
async def startup():
    logger.info("🚀 DalalStreet AI v%s starting (%s)", settings.app_version, settings.app_env)
    await init_db()
    db = await check_database_connection()
    if db.get("ok"):
        logger.info("PostgreSQL: %s", db.get("detail"))
    else:
        logger.warning("PostgreSQL: %s (API still runs; fix DATABASE_URL for DB features)", db.get("detail"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.app_env == "development")
