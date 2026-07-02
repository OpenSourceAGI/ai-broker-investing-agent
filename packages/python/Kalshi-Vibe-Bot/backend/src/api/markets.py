from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException

from src.app_state import app_state
from src.config import settings
from src.logger import logger

router = APIRouter(tags=["markets"])


@router.get("/markets")
async def get_available_markets(category: Optional[str] = None):
    """Debug/helper: sample of open Kalshi markets (first 50). Not used by the dashboard."""
    kc = app_state.kalshi_client
    if kc is None:
        raise HTTPException(status_code=503, detail="Kalshi client not ready")
    try:
        filters = {"category": category} if category else {}
        now_ts = int(datetime.now(timezone.utc).timestamp())
        filters.setdefault("status", "open")
        filters.setdefault("mve_filter", "exclude")
        fetch_h = int(getattr(settings, "bot_markets_fetch_max_close_hours", settings.bot_max_hours))
        filters.setdefault("max_close_ts", now_ts + fetch_h * 3600)
        markets = await kc.get_markets(filters)
        return {"count": len(markets), "markets": markets[:50]}
    except Exception as e:
        logger.error("Markets error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
