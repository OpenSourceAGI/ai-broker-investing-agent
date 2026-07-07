"""UTC-aware datetimes for persistence, comparisons, and API serialization."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional


def utc_now() -> datetime:
    """Current time in UTC (timezone-aware)."""
    return datetime.now(timezone.utc)


def utc_today() -> date:
    return utc_now().date()


def ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """Interpret naive datetimes as UTC; normalize aware values to UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def utc_iso_z(dt: Optional[datetime]) -> Optional[str]:
    """Serialize a datetime as ISO-8601 with ``Z`` (for JSON / WebSocket)."""
    if dt is None:
        return None
    dt = ensure_utc(dt)
    assert dt is not None
    return dt.isoformat().replace("+00:00", "Z")
