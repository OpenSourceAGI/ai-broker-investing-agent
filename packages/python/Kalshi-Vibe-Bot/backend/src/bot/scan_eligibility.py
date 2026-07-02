"""Order-search (market scan + AI analysis) eligibility for the bot loop and dashboard."""

from __future__ import annotations

import math
from typing import Any, Optional, Tuple

from sqlalchemy.orm import Session

from src.api.common import ensure_bot_state
from src.app_state import app_state
from src.ai_provider import normalize_ai_provider
from src.config import DEFAULT_MAX_OPEN_POSITIONS

# Do not fetch markets or run AI analysis when uninvested deployable cash is below this (USD).
MIN_DEPLOYABLE_USD_FOR_ORDER_SEARCH = 1.0

# Total portfolio value (Kalshi portfolio_value live; paper cash + marks): halt scan when this low.
TOTAL_BALANCE_WARN_BELOW_USD = 5.0


def compute_order_search_scan_labels(
    bot_state: str,
    settings: Any,
    available_cash: float,
    *,
    total_portfolio_value_usd: float,
    xai_prepaid_balance_usd: Optional[float] = None,
    open_position_count: int = 0,
    ai_provider: Optional[str] = None,
) -> Tuple[bool, str]:
    """Return (active_scanning, concise_ui_label)."""
    st = (bot_state or "stop").strip().lower()
    if st == "stop":
        return False, "Stopped — no new scans"
    if st == "pause":
        return False, "Paused — no new scans"

    prov = normalize_ai_provider(
        ai_provider if ai_provider is not None else getattr(settings, "default_ai_provider", "gemini")
    )
    if prov == "xai" and xai_prepaid_balance_usd is not None:
        try:
            xai_bal = float(xai_prepaid_balance_usd)
        except (TypeError, ValueError):
            pass
        else:
            if math.isfinite(xai_bal) and xai_bal < 1.0:
                return False, "Insufficient xAI balance"

    try:
        tv = float(total_portfolio_value_usd)
    except (TypeError, ValueError):
        tv = float("nan")
    if math.isfinite(tv):
        if tv <= 0.0:
            return False, "Holding — zero total balance"
        if tv < float(TOTAL_BALANCE_WARN_BELOW_USD):
            return False, "Holding — total balance under $5"

    bal = max(0.0, float(available_cash))

    min_dep = float(MIN_DEPLOYABLE_USD_FOR_ORDER_SEARCH)
    if bal < min_dep:
        return False, f"Holding — deployable funds under ${min_dep:g}"

    try:
        cap = int(getattr(settings, "bot_max_open_positions", DEFAULT_MAX_OPEN_POSITIONS))
    except (TypeError, ValueError):
        cap = DEFAULT_MAX_OPEN_POSITIONS
    cap = max(1, min(500, cap))
    n_open = max(0, int(open_position_count))
    if n_open >= cap:
        return False, f"At open position limit ({n_open}/{cap})"

    return True, "Active — searching for new positions"


def refresh_order_search_scan_ui(
    db: Session,
    settings: Any,
    available_cash: float,
    *,
    total_portfolio_value_usd: float,
    xai_prepaid_balance_usd: Optional[float] = None,
    open_position_count: int = 0,
    ai_provider: Optional[str] = None,
) -> Tuple[bool, str]:
    """Persist latest scan UX on ``app_state`` for ``GET /portfolio`` and logs."""
    row = ensure_bot_state(db)
    bot_state = row.state or "stop"
    active, label = compute_order_search_scan_labels(
        bot_state,
        settings,
        available_cash,
        total_portfolio_value_usd=total_portfolio_value_usd,
        xai_prepaid_balance_usd=xai_prepaid_balance_usd,
        open_position_count=open_position_count,
        ai_provider=ai_provider,
    )
    app_state.order_search_active = active
    app_state.order_search_label = label
    return active, label
