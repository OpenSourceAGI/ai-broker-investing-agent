import httpx
from fastapi import APIRouter, HTTPException

from src.app_state import app_state
from src.config import settings
from src.logger import log_buffer

router = APIRouter(tags=["logs"])


@router.get("/logs")
async def get_logs(limit: int = 200):
    entries = list(log_buffer)
    return entries[-limit:] if len(entries) > limit else entries


@router.get("/debug/raw")
async def debug_raw_markets(page: int = 1):
    """Fetch a raw Kalshi API page for debugging field names and values."""
    if not bool(getattr(settings, "enable_debug_raw_kalshi", False)):
        raise HTTPException(status_code=404, detail="Not found")

    kc = app_state.kalshi_client
    if kc is None:
        return {"error": "Kalshi client not ready"}

    path = "/trade-api/v2/markets"
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            cursor = None
            data = {}
            resp = None
            for p in range(page):
                params: dict = {"limit": 200, "status": "open"}
                if cursor:
                    params["cursor"] = cursor
                resp = await client.get(
                    f"{settings.kalshi_base_url}{path}",
                    params=params,
                    headers=kc._get_auth_headers("GET", path),
                )
                data = resp.json()
                cursor = data.get("cursor")
                if not cursor and p < page - 1:
                    return {"error": f"Only {p + 1} page(s) available"}

            raw = data.get("markets", [])
            sample = raw[:3]
            return {
                "page": page,
                "status_code": resp.status_code if resp else None,
                "total_on_page": len(raw),
                "has_next_page": bool(cursor),
                "first_20_tickers": [m.get("ticker", m.get("id", "?")) for m in raw[:20]],
                "raw_sample": sample,
                "normalized_sample": [kc._normalize_market(m) for m in sample],
            }
    except Exception as e:
        return {"error": str(e)}
