"""
FastAPI application: lifespan, middleware, and route registration.

HTTP/WebSocket handlers live under src/api/.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.analysis import router as analysis_router
from src.api.bot import router as bot_router
from src.api.broadcast import broadcast_update
from src.api.common import ensure_bot_state
from src.api.health import router as health_router
from src.api.logs_debug import router as logs_debug_router
from src.api.markets import router as markets_router
from src.api.portfolio import router as portfolio_router
from src.api.trades import router as trades_router
from src.api.tuning import router as tuning_router, sync_runtime_from_db
from src.api.websocket_route import router as websocket_router
from src.app_state import app_state
from src.bot.loop import run_bot_loop
from src.clients.kalshi_client import KalshiClient
from src.config import settings
from src.version import APP_VERSION
from src.database.models import get_session_local, init_db
from src.decision_engine.analyzer import DecisionEngine
from src.logger import logger, set_broadcast_callback


def _cors_allow_origins() -> list[str]:
    raw = (settings.cors_origins or "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["http://localhost:3000", "http://127.0.0.1:3000"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    _db = get_session_local()()
    try:
        row = ensure_bot_state(_db)
        # Always start stopped after a process restart so live trading cannot resume unattended.
        row.state = "stop"
        _db.commit()
        sync_runtime_from_db(_db)
    finally:
        _db.close()

    app_state.decision_engine = DecisionEngine(
        xai_api_key=settings.xai_api_key,
        xai_model=settings.xai_model,
        gemini_api_key=settings.gemini_api_key,
        gemini_model=settings.gemini_model,
        temperature=settings.ai_temperature,
        ai_provider=settings.default_ai_provider,
    )

    app_state.kalshi_client = KalshiClient(
        api_key=settings.kalshi_api_key,
        private_key_path=settings.kalshi_private_key_path,
        base_url=settings.kalshi_base_url,
    )

    set_broadcast_callback(broadcast_update)
    app_state.bot_loop_task = asyncio.create_task(
        run_bot_loop(
            app_state.kalshi_client,
            app_state.decision_engine,
            get_session_local(),
            broadcast_update,
            settings,
        )
    )

    if not (getattr(settings, "kalshi_api_key", None) or "").strip():
        logger.warning("KALSHI_API_KEY is empty — Kalshi API calls will fail until set in backend/.env")
    if settings.default_ai_provider == "xai" and not (getattr(settings, "xai_api_key", None) or "").strip():
        logger.warning("XAI_API_KEY is empty — xAI analysis will fail until set in backend/.env")
    if settings.default_ai_provider == "gemini" and not (getattr(settings, "gemini_api_key", None) or "").strip():
        logger.warning("GEMINI_API_KEY is empty — Gemini analysis will fail until set in backend/.env")

    logger.info(
        "Application ready — mode=%s scan_interval=%ds min_edge=%d%% stop_loss_drawdown=%.0f%%",
        settings.trading_mode,
        settings.bot_scan_interval,
        settings.min_edge_to_buy_pct,
        settings.stop_loss_drawdown_pct * 100.0,
    )

    yield

    task = app_state.bot_loop_task
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    kc = app_state.kalshi_client
    if kc is not None:
        try:
            await kc.aclose()
        except Exception:
            pass
    try:
        from src.clients.gemini_client import aclose_shared_gemini_http
        from src.clients.xai_client import aclose_shared_xai_http

        await aclose_shared_xai_http()
        await aclose_shared_gemini_http()
    except Exception:
        pass
    logger.info("Shutting down.")


app = FastAPI(
    title="Kalshi Vibe Bot",
    description="Binary Kalshi markets: local liquidity vetting, Gemini or xAI (Grok) P(YES) + edge, full Kelly sizing, stop-loss-only exits.",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(websocket_router)
app.include_router(bot_router)
app.include_router(tuning_router)
app.include_router(portfolio_router)
app.include_router(markets_router)
app.include_router(analysis_router)
app.include_router(trades_router)
app.include_router(logs_debug_router)
