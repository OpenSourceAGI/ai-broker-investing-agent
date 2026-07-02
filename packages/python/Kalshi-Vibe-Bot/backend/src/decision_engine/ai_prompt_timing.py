"""Server-authoritative timing lines for LLM prompts (avoids UTC vs EDT date confusion)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from src.util.datetimes import ensure_utc, utc_iso_z, utc_now


def _eastern_tz():
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo("America/New_York")
    except Exception:
        # Windows dev boxes often lack the ``tzdata`` package; UTC anchor remains authoritative.
        return timezone(timedelta(hours=-4), name="EDT")


def _parse_iso(raw: object) -> Optional[datetime]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        return ensure_utc(datetime.fromisoformat(s.replace("Z", "+00:00")))
    except Exception:
        return None


def _resolution_anchor_dt(
    *,
    expected_expiration_time: Optional[str] = None,
    vetting_horizon_time: Optional[str] = None,
    close_time: Optional[str] = None,
    now: datetime,
) -> Optional[datetime]:
    """Same priority as buy-horizon vetting: future ``expected_expiration_time``, else soonest future anchor."""
    exp = _parse_iso(expected_expiration_time)
    if exp is not None and exp > now:
        return exp

    seen: set[str] = set()
    candidates: List[datetime] = []
    for raw in (vetting_horizon_time, close_time, expected_expiration_time):
        if not raw:
            continue
        iso = str(raw).strip()
        if not iso or iso in seen:
            continue
        seen.add(iso)
        dt = _parse_iso(iso)
        if dt is not None and dt > now:
            candidates.append(dt)
    if candidates:
        return min(candidates)
    # All anchors past — use latest anchor for display (post-resolution context).
    fallback: List[datetime] = []
    for raw in (expected_expiration_time, vetting_horizon_time, close_time):
        dt = _parse_iso(raw)
        if dt is not None:
            fallback.append(dt)
    return max(fallback) if fallback else None


def _format_duration_remaining(seconds: float) -> str:
    sec = float(seconds)
    if sec <= 0:
        past_min = max(1, int(round(abs(sec) / 60.0)))
        return (
            f"Resolution anchor was ~{past_min} minute(s) ago (per server UTC) — "
            f"event time has passed; do not trade as if the outcome is still open unless rules say otherwise."
        )
    if sec < 90:
        return (
            f"{max(1, int(round(sec)))} seconds remaining — resolution has **NOT** yet occurred (per server UTC)."
        )
    if sec < 3600:
        mins = max(1, int(round(sec / 60.0)))
        return (
            f"{mins} minute(s) remaining — resolution has **NOT** yet occurred (per server UTC). "
            f"Do **not** claim the event is in the past while this is positive."
        )
    if sec < 86400:
        hrs = sec / 3600.0
        return (
            f"~{hrs:.1f} hour(s) remaining — resolution has **NOT** yet occurred (per server UTC)."
        )
    days = sec / 86400.0
    return (
        f"~{days:.1f} day(s) remaining — resolution has **NOT** yet occurred (per server UTC)."
    )


def build_ai_timing_for_prompt(
    *,
    expected_expiration_time: Optional[str] = None,
    vetting_horizon_time: Optional[str] = None,
    close_time: Optional[str] = None,
    expires_in_days_fallback: Optional[float] = None,
    now: Optional[datetime] = None,
) -> Dict[str, str]:
    """Fields for ``USER_PROMPT_TEMPLATE`` / event-batch leg blocks."""
    now_dt = ensure_utc(now) if now is not None else utc_now()
    assert now_dt is not None

    anchor = _resolution_anchor_dt(
        expected_expiration_time=expected_expiration_time,
        vetting_horizon_time=vetting_horizon_time,
        close_time=close_time,
        now=now_dt,
    )
    now_utc = utc_iso_z(now_dt) or ""
    if anchor is not None:
        resolution_at_utc = utc_iso_z(anchor) or "unknown"
        try:
            resolution_at_et = anchor.astimezone(_eastern_tz()).strftime("%Y-%m-%d %I:%M %p %Z")
        except Exception:
            resolution_at_et = resolution_at_utc
        seconds = (anchor - now_dt).total_seconds()
        time_until = _format_duration_remaining(seconds)
    else:
        resolution_at_utc = "unknown"
        resolution_at_et = "unknown"
        if expires_in_days_fallback is not None and expires_in_days_fallback > 0:
            seconds = float(expires_in_days_fallback) * 86400.0
            time_until = _format_duration_remaining(seconds) + " (approximate — no parseable resolution timestamp)"
        else:
            time_until = "unknown — no parseable resolution timestamp on file"

    return {
        "now_utc": now_utc,
        "resolution_at_utc": resolution_at_utc,
        "resolution_at_et": resolution_at_et,
        "time_until_resolution": time_until,
        "time_desc": time_until,
    }


def build_ai_timing_for_prompt_from_market(market: Dict[str, Any], *, now: Optional[datetime] = None) -> Dict[str, str]:
    exp = market.get("expires_in_days")
    try:
        exp_f = float(exp) if exp is not None else None
    except (TypeError, ValueError):
        exp_f = None
    return build_ai_timing_for_prompt(
        expected_expiration_time=market.get("expected_expiration_time"),
        vetting_horizon_time=market.get("vetting_horizon_time"),
        close_time=market.get("close_time"),
        expires_in_days_fallback=exp_f,
        now=now,
    )
