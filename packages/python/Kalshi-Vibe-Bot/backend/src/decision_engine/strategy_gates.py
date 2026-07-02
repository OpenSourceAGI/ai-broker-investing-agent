"""Autonomous buy guardrails (baked from closed-trade analysis; not exposed in Settings UI)."""

from __future__ import annotations

import math
from typing import Optional

from src.decision_engine.strategy_math import ai_win_prob_pct_on_buy_side, max_whole_contracts_for_cash

# Upper/lower bounds applied after user min edge / min AI (Settings + .env).
MAX_EDGE_TO_BUY_PCT = 22
# Favorites (e.g. 85% NO at 73¢) are allowed; extreme tail confidence is still blocked.
MAX_AI_WIN_PROB_BUY_SIDE_PCT = 90
MIN_ENTRY_PRICE_CENTS = 26
# Max premium at risk per entry: full Kelly is capped to this fraction of deployable cash.
MAX_KELLY_BANKROLL_PCT = 0.05

# Sports: stricter scan (volume) and exit grace only — min edge uses your Settings value as-is.
_SPORTS_MIN_VOLUME_FLOOR = 2000.0
_SPORTS_EXIT_GRACE_EXTRA_MINUTES = 5.0

# High AI % on mid-priced contracts historically lost large despite decent win rate.
_OVERCONF_AI_MIN_PCT = 75
_OVERCONF_ENTRY_CENTS_LO = 41
_OVERCONF_ENTRY_CENTS_HI = 65


def is_sports_market_title(title: str, event_ticker: str = "") -> bool:
    t = f"{title or ''} {event_ticker or ''}".lower()
    return any(
        k in t
        for k in (
            " vs ",
            "total goals",
            "total maps",
            "btts",
            "both teams to score",
            "spread",
            "moneyline",
        )
    )


def effective_scan_min_volume(base_min_volume: float, title: str, event_ticker: str = "") -> float:
    base = max(0.0, float(base_min_volume))
    if is_sports_market_title(title, event_ticker):
        return max(base, _SPORTS_MIN_VOLUME_FLOOR)
    return base


def effective_min_edge_for_market(min_edge_base: float, title: str, event_ticker: str = "") -> float:
    """Return the user-configured min edge (Settings / ``MIN_EDGE_TO_BUY_PCT``); unchanged by market type."""
    return max(0.0, float(min_edge_base))


def exit_grace_minutes_for_market(settings_grace_minutes: float, title: str, event_ticker: str = "") -> float:
    g = max(0.0, float(settings_grace_minutes))
    if is_sports_market_title(title, event_ticker):
        return g + _SPORTS_EXIT_GRACE_EXTRA_MINUTES
    return g


def kelly_contract_cap_for_bankroll(bankroll: float, per_contract_premium: float) -> int:
    """Whole-contract cap: ``MAX_KELLY_BANKROLL_PCT`` of deployable cash, never above cash affordance.

    When 5% of bankroll cannot buy a whole contract (small accounts), fall back to cash-limited
    sizing only so Kelly + affordability still work; the 5% rule applies once stake can fund ≥1 contract.
    """
    br = float(bankroll)
    px = float(per_contract_premium)
    if not math.isfinite(br) or not math.isfinite(px) or br <= 0 or px <= 1e-12:
        return 0
    cash_cap = max_whole_contracts_for_cash(br, px)
    if cash_cap < 1:
        return 0
    stake_cap = br * float(MAX_KELLY_BANKROLL_PCT)
    pct_cap = int(math.floor(stake_cap / px + 1e-12))
    if pct_cap < 1:
        return cash_cap
    return min(pct_cap, cash_cap)


def autonomous_buy_gate_failure(
    *,
    side: str,
    ai_yes_pct: int,
    edge_pct: float,
    entry_price_dollars: float,
) -> Optional[str]:
    """Return a skip summary when autonomous guardrails reject the buy; else ``None``."""
    ai_buy = int(ai_win_prob_pct_on_buy_side(side, ai_yes_pct))
    edge = float(edge_pct)
    entry_c = int(max(0, min(100, round(float(entry_price_dollars) * 100.0))))

    if edge > MAX_EDGE_TO_BUY_PCT + 1e-9:
        return (
            f"Skipped — edge {edge:.1f} pts exceeds autonomous cap ({MAX_EDGE_TO_BUY_PCT} pts; "
            "often model overconfidence)"
        )
    if ai_buy > MAX_AI_WIN_PROB_BUY_SIDE_PCT:
        return (
            f"Skipped — AI win prob on buy side {ai_buy}% exceeds autonomous cap "
            f"({MAX_AI_WIN_PROB_BUY_SIDE_PCT}%)"
        )
    if entry_c < MIN_ENTRY_PRICE_CENTS:
        return f"Skipped — entry {entry_c}¢ below autonomous floor ({MIN_ENTRY_PRICE_CENTS}¢)"
    if (
        ai_buy >= _OVERCONF_AI_MIN_PCT
        and _OVERCONF_ENTRY_CENTS_LO <= entry_c <= _OVERCONF_ENTRY_CENTS_HI
    ):
        return (
            f"Skipped — calibration guard: AI {ai_buy}% on {entry_c}¢ entry "
            "(mid-priced high-confidence bucket underperformed historically)"
        )
    return None
