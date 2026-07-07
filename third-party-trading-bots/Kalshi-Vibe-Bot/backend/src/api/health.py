from fastapi import APIRouter

from src.config import settings
from src.util.datetimes import utc_iso_z, utc_now
from src.version import APP_VERSION

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": utc_iso_z(utc_now()),
        "mode": settings.trading_mode,
        "version": APP_VERSION,
    }
