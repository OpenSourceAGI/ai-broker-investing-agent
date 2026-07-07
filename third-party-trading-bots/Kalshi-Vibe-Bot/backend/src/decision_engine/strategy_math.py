"""Edge and full Kelly sizing for binary Kalshi contracts (prices as 0–1 dollars per $1 payoff)."""

from __future__ import annotations

import math
from typing import Optional, Tuple

# Baked contrarian buy tier (not configurable): when the book is skeptical of the buy side but
# Model is much more bullish than the book, require extra edge and a higher AI win-prob floor on that side.
_CONTRARIAN_IMPLIED_BUY_MAX_PCT = 25
_CONTRARIAN_AI_OVER_IMPLIED_MIN_GAP_PCT = 15
_CONTRARIAN_EXTRA_MIN_EDGE_PCT = 5
_CONTRARIAN_EXTRA_MIN_AI_WIN_PROB_PCT = 4


def _clamp_unit(x: float) -> float:
    if not math.isfinite(x):
        return 0.0
    return max(0.0, min(1.0, float(x)))


def executable_asks(
    yes_ask: Optional[float],
    no_ask: Optional[float],
    yes_mid: float,
    no_mid: float,
) -> Tuple[float, float]:
    """Best executable buy prices; fall back to mids when ask missing."""
    ym = _clamp_unit(float(yes_mid or 0.5))
    nm = _clamp_unit(float(no_mid or 0.5))
    ya = float(yes_ask) if yes_ask is not None and float(yes_ask) > 0 else ym
    na = float(no_ask) if no_ask is not None and float(no_ask) > 0 else nm
    return _clamp_unit(ya), _clamp_unit(na)


def ai_yes_probability(ai_yes_pct: int) -> float:
    return max(0.0, min(1.0, float(int(ai_yes_pct)) / 100.0))


def market_implied_pct_for_side(side: str, yes_ask: Optional[float], no_ask: Optional[float], yes_mid: float, no_mid: float) -> int:
    ya, na = executable_asks(yes_ask, no_ask, yes_mid, no_mid)
    v = (ya * 100.0) if str(side).upper() == "YES" else (na * 100.0)
    return int(max(0, min(100, round(v))))


def edge_pct_for_side(
    side: str,
    ai_yes_pct: int,
    yes_ask: Optional[float],
    no_ask: Optional[float],
    yes_mid: float,
    no_mid: float,
) -> float:
    """Edge in percentage points: AI win prob for that side minus market-implied (ask) for that side."""
    p_yes = ai_yes_probability(ai_yes_pct)
    ya, na = executable_asks(yes_ask, no_ask, yes_mid, no_mid)
    if str(side).upper() == "YES":
        return p_yes * 100.0 - ya * 100.0
    p_no = 1.0 - p_yes
    return p_no * 100.0 - na * 100.0


def full_kelly_fraction_for_side(
    side: str,
    ai_yes_pct: int,
    yes_ask: Optional[float],
    no_ask: Optional[float],
    yes_mid: float,
    no_mid: float,
) -> float:
    """Fraction of bankroll to allocate to premium at the quoted asks (0 when no edge at ask)."""
    p_yes = ai_yes_probability(ai_yes_pct)
    ya, na = executable_asks(yes_ask, no_ask, yes_mid, no_mid)
    if str(side).upper() == "YES":
        p, b = p_yes, ya
    else:
        p, b = (1.0 - p_yes), na
    if b <= 1e-12 or b >= 1.0 - 1e-12:
        return 0.0
    if p <= b + 1e-12:
        return 0.0
    f = (p - b) / (1.0 - b)
    return max(0.0, min(1.0, float(f)))


def kelly_contracts_for_side(
    bankroll: float,
    side: str,
    ai_yes_pct: int,
    yes_ask: Optional[float],
    no_ask: Optional[float],
    yes_mid: float,
    no_mid: float,
) -> int:
    """Full Kelly size in whole contracts (rounded down)."""
    br = float(bankroll)
    if not math.isfinite(br) or br <= 0:
        return 0
    ya, na = executable_asks(yes_ask, no_ask, yes_mid, no_mid)
    b = ya if str(side).upper() == "YES" else na
    f = full_kelly_fraction_for_side(side, ai_yes_pct, yes_ask, no_ask, yes_mid, no_mid)
    if f <= 0 or b <= 1e-12:
        return 0
    stake = f * br
    return int(math.floor(stake / b + 1e-12))


def max_whole_contracts_for_cash(bankroll: float, per_contract_premium: float) -> int:
    """Largest whole-contract count affordable at ``per_contract_premium`` (premium $/contract, 0–1)."""
    br = float(bankroll)
    px = float(per_contract_premium)
    if not math.isfinite(br) or not math.isfinite(px) or br <= 0 or px <= 1e-12:
        return 0
    return int(math.floor(br / px + 1e-12))


def kelly_contracts_for_order(
    bankroll: float,
    side: str,
    ai_yes_pct: int,
    yes_ask: Optional[float],
    no_ask: Optional[float],
    yes_mid: float,
    no_mid: float,
    *,
    per_contract_premium: float,
    max_kelly_contracts: Optional[int] = None,
) -> Tuple[int, str]:
    """Whole-contract size for a buy: full Kelly (floored), capped by cash at ``per_contract_premium``.

    If Kelly rounds to **zero** contracts but the Kelly fraction is still **positive** (edge at the ask),
    the bot buys **one** contract when cash can afford it (``single_contract_retry``).

    Returns ``(quantity, tag)`` where ``tag`` is ``full_kelly``, ``cash_capped``, ``single_contract_retry``,
    or ``none`` (no edge at ask and/or cannot afford one contract at ``per_contract_premium``).
    """
    k = kelly_contracts_for_side(bankroll, side, ai_yes_pct, yes_ask, no_ask, yes_mid, no_mid)
    cap = max_whole_contracts_for_cash(bankroll, per_contract_premium)
    if cap < 1:
        return 0, "none"
    mk: Optional[int]
    if max_kelly_contracts is not None:
        mk = max(0, int(max_kelly_contracts))
    else:
        mk = None

    def _cap(qty: int) -> int:
        if mk is None:
            return int(qty)
        return min(int(qty), mk)

    if k >= 1:
        q = _cap(min(int(k), cap))
        if q < 1:
            return 0, "none"
        return q, "cash_capped" if q < int(k) else "full_kelly"

    f = full_kelly_fraction_for_side(side, ai_yes_pct, yes_ask, no_ask, yes_mid, no_mid)
    if f > 1e-12:
        q = _cap(1)
        if q < 1:
            return 0, "none"
        return q, "single_contract_retry"
    return 0, "none"


def kelly_order_skip_summary(
    bankroll: float,
    side: str,
    ai_yes_pct: int,
    yes_ask: Optional[float],
    no_ask: Optional[float],
    yes_mid: float,
    no_mid: float,
    *,
    per_contract_premium: float,
    max_kelly_contracts: Optional[int] = None,
) -> Optional[str]:
    """Human-readable skip reason when :func:`kelly_contracts_for_order` returns quantity 0; else ``None``."""
    qty, _tag = kelly_contracts_for_order(
        bankroll,
        side,
        ai_yes_pct,
        yes_ask,
        no_ask,
        yes_mid,
        no_mid,
        per_contract_premium=per_contract_premium,
        max_kelly_contracts=max_kelly_contracts,
    )
    if qty >= 1:
        return None

    f = full_kelly_fraction_for_side(side, ai_yes_pct, yes_ask, no_ask, yes_mid, no_mid)
    if f <= 1e-12:
        ai_buy = int(ai_win_prob_pct_on_buy_side(side, ai_yes_pct))
        ask_c = int(max(0, min(100, round(float(per_contract_premium) * 100.0))))
        edge_at_ask = float(ai_buy) - float(ask_c)
        su = str(side or "").upper()
        return (
            f"Skipped — no edge at ask: AI {ai_buy}% on {su} vs ask {ask_c}¢ "
            f"(edge {edge_at_ask:+.1f} pts at executable price)"
        )

    ask_c = int(max(0, min(100, round(float(per_contract_premium) * 100.0))))
    deploy = float(bankroll)
    return (
        "Skipped — Kelly size is zero and available cash cannot buy "
        f"a whole contract at current prices (deployable ${deploy:.2f}, ask {ask_c}¢)"
    )


def ai_win_prob_pct_on_buy_side(side: str, ai_yes_pct: int) -> int:
    """AI P(win) for the purchased contract side (YES leg or NO leg), 0–100 integer."""
    y = int(max(0, min(100, int(ai_yes_pct))))
    return y if str(side).upper() == "YES" else 100 - y


def contrarian_buy_tier_active(
    *,
    side: str,
    ai_yes_pct: int,
    yes_ask: Optional[float],
    no_ask: Optional[float],
    yes_mid: float,
    no_mid: float,
) -> bool:
    """True when the market is very skeptical of the buy side but the model is much more bullish (baked thresholds)."""
    implied = int(market_implied_pct_for_side(side, yes_ask, no_ask, yes_mid, no_mid))
    ai_buy = int(ai_win_prob_pct_on_buy_side(side, ai_yes_pct))
    return bool(
        implied <= _CONTRARIAN_IMPLIED_BUY_MAX_PCT
        and (ai_buy - implied) >= _CONTRARIAN_AI_OVER_IMPLIED_MIN_GAP_PCT
    )


def effective_buy_gate_thresholds(
    *,
    side: str,
    ai_yes_pct: int,
    yes_ask: Optional[float],
    no_ask: Optional[float],
    yes_mid: float,
    no_mid: float,
    min_edge_base: float,
    min_ai_win_prob_base: int,
) -> Tuple[float, int, bool]:
    """Return ``(effective_min_edge_pct, effective_min_ai_win_prob_buy_side, contrarian_buy_tier)``."""
    tier = contrarian_buy_tier_active(
        side=side,
        ai_yes_pct=ai_yes_pct,
        yes_ask=yes_ask,
        no_ask=no_ask,
        yes_mid=yes_mid,
        no_mid=no_mid,
    )
    extra_e = _CONTRARIAN_EXTRA_MIN_EDGE_PCT if tier else 0
    extra_p = _CONTRARIAN_EXTRA_MIN_AI_WIN_PROB_PCT if tier else 0
    eff_edge = float(min_edge_base) + float(extra_e)
    eff_ai = int(min_ai_win_prob_base) + int(extra_p)
    eff_ai = max(51, min(99, eff_ai))
    return eff_edge, eff_ai, tier
