"""Kalshi REST v2 client: markets, portfolio, RSA-signed requests, IOC buys, IOC/min-tick exits (whole contracts)."""

import asyncio
import base64
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from src.config import settings
from src.logger import setup_logging
from src.reconcile.open_positions import normalize_market_id

logger = setup_logging("kalshi_client")


def _optional_float(v: object) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        f = float(v)  # type: ignore[arg-type]
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def _markets_list_resume_bucket_key(filters: Optional[Dict[str, Any]]) -> Optional[str]:
    """Key for rotating market-list pagination: same bucket keeps a saved API ``cursor`` across scans.

    Uses a coarse ``max_close_ts`` bucket so 10s bot ticks do not invalidate the resume token every pass.
    Returns ``None`` when rotation does not apply (unbounded / undifferentiated fetches).
    """
    if not filters or "max_close_ts" not in filters:
        return None
    try:
        ts = int(filters.get("max_close_ts") or 0)
    except (TypeError, ValueError):
        return None
    if ts <= 0:
        return None
    bucket = ts // 900  # 15-minute windows
    st = str(filters.get("status", "") or "")
    mve = str(filters.get("mve_filter", "") or "")
    return f"{st}|{mve}|{bucket}"


def _fp_count(raw: Any) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def _fp_dollars(raw: Any) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def kalshi_order_filled_contracts(order: Dict[str, Any]) -> float:
    """Filled size from a Kalshi ``order`` object (``fill_count_fp``)."""
    return _fp_count(order.get("fill_count_fp"))


def kalshi_order_fill_cost_dollars(order: Dict[str, Any]) -> float:
    """Total filled notional (taker + maker legs) in dollars."""
    return _fp_dollars(order.get("taker_fill_cost_dollars")) + _fp_dollars(order.get("maker_fill_cost_dollars"))


def kalshi_order_fees_dollars(order: Dict[str, Any]) -> float:
    """Total fees for the order fill (taker + maker) in dollars."""
    return _fp_dollars(order.get("taker_fees_dollars")) + _fp_dollars(order.get("maker_fees_dollars"))


def is_order_error_market_unavailable(err: object) -> bool:
    """True when Kalshi rejects sells because the market no longer accepts orders (404 ended/archived)."""
    s = str(err or "").strip().lower()
    if "404" not in s:
        return False
    return "market not found" in s or ("not found" in s and "market" in s)


def _kalshi_order_side(order: Dict[str, Any]) -> str:
    s = str(order.get("side") or "").strip().upper()
    if s in {"YES", "NO"}:
        return s
    if s.lower() == "yes":
        return "YES"
    if s.lower() == "no":
        return "NO"
    return ""


def _integer_cent_price_to_dollars(raw: Any) -> Optional[float]:
    """Some payloads use ``yes_price`` / ``no_price`` as integers 1–99 meaning **cents**, not dollars."""
    if raw is None:
        return None
    if isinstance(raw, str) and "." in raw.strip():
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if abs(v - round(v)) > 1e-9:
        return None
    iv = int(round(v))
    if 1 <= iv <= 99:
        return iv / 100.0
    return None


def _kalshi_order_price_fields(order: Dict[str, Any]) -> Tuple[float, float]:
    """Return (yes_price_dollars, no_price_dollars) when present on order objects."""
    yp = _fp_dollars(order.get("yes_price_dollars") or 0)
    np = _fp_dollars(order.get("no_price_dollars") or 0)
    if yp <= 0 and order.get("yes_price") is not None:
        lc = _integer_cent_price_to_dollars(order.get("yes_price"))
        yp = float(lc) if lc is not None else _fp_dollars(order.get("yes_price"))
    if np <= 0 and order.get("no_price") is not None:
        lc = _integer_cent_price_to_dollars(order.get("no_price"))
        np = float(lc) if lc is not None else _fp_dollars(order.get("no_price"))
    return (float(yp), float(np))


def _kalshi_order_limit_fallback_per_contract_dollars(order: Dict[str, Any]) -> float:
    """Prefer the order's **side** leg for IOC limit fallbacks (avoid YES sells taking NO's book leg)."""
    yp, np = _kalshi_order_price_fields(order)
    su = (_kalshi_order_side(order) or "YES").upper()
    if su == "NO":
        return float(np if np > 0 else yp)
    return float(yp if yp > 0 else np)


def _held_side_price_from_fill_average(per_contract: float, _side: str) -> float:
    """Clamp ``|fill_cost|/filled`` to ``[0,1]`` on the order leg (YES or NO); do not apply ``1-p``."""
    x = float(per_contract or 0.0)
    return max(0.0, min(1.0, x))


def _sell_positive_fill_as_opposite_leg_to_held_side_price(
    order: Dict[str, Any],
    *,
    fd: float,
    fees_dollars: float,
) -> Optional[float]:
    """Elections API quirk: executed **sells** sometimes emit **positive** ``taker_fill_cost_dollars``
    as **opposite-leg** dollar notional (YES dollars when selling NO, NO dollars when selling YES).

    Reconstruct held-side $/contract via ``1 − (|fill| + fees) / qty``. Negative fill costs (credits)
    use the normal ``|fill|/qty`` path instead.
    """
    fd = max(0.0, float(fd))
    if fd <= 1e-12:
        return None
    raw = float(kalshi_order_fill_cost_dollars(order))
    action = str(order.get("action") or "").strip().lower()
    if action != "sell" or raw <= 0:
        return None
    su = (_kalshi_order_side(order) or "").upper()
    if su not in {"YES", "NO"}:
        return None
    fill_mag = abs(raw)
    fe = max(0.0, float(fees_dollars))
    pc_opp = (fill_mag + fe) / fd
    pc_opp = max(0.0, min(1.0, pc_opp))
    return max(0.0, min(1.0, 1.0 - pc_opp))


def kalshi_order_average_fill_price_dollars(order: Dict[str, Any]) -> float:
    """Kalshi-reported VWAP in **dollars per contract** on the traded leg (clamped to ``[0, 1]``).

    Some envelopes emit ``average_fill_price`` as a whole cent (e.g. ``35`` for $0.35) with no
    decimal; treat ``1..99`` that way. Dollar strings like ``0.3500`` pass through as floats.
    """
    for key in ("average_fill_price_dollars", "average_fill_price", "avg_fill_price_dollars"):
        raw = order.get(key)
        if raw is None or raw == "":
            continue
        s = str(raw).strip()
        try:
            v = float(s)
        except (TypeError, ValueError):
            continue
        if v <= 0:
            continue
        if "." not in s and 1.0 <= v <= 99.0 and abs(v - round(v)) < 1e-9:
            v = v / 100.0
        return max(0.0, min(1.0, v))
    return 0.0


def kalshi_order_avg_contract_price_and_cost(
    order: Dict[str, Any],
    *,
    filled: float,
    fallback_per_contract_dollars: float,
) -> Tuple[float, float]:
    """Per-contract average fill and total filled cost (for ledger / ``Position.entry_price``).

    Prefer **fill notional** ``|taker+maker fill cost| / filled`` when it agrees with Kalshi's
    ``average_fill_price*`` VWAP; on large divergence, trust the API average. Falls back to limit
    leg prices and ``fallback_per_contract_dollars``.
    """
    fd = max(0.0, float(filled))
    fill_cost = kalshi_order_fill_cost_dollars(order)
    fees = kalshi_order_fees_dollars(order)
    fill_mag = abs(float(fill_cost))
    action_lo = str(order.get("action") or "").strip().lower()
    raw_fc = float(fill_cost)
    # Kalshi trade-history avg $/contract matches ``(taker_fill + fees_on_this_order) / qty`` when the
    # fill field excludes fees but UI "Cost" includes contract debit only — total cash is fill + fees.
    if action_lo == "buy" and raw_fc > 0 and fd > 1e-12:
        eff = max(0.0, min(1.0, (fill_mag + fees) / fd))
        total = max(0.0, fill_mag + fees)
        return (eff, total)
    side = _kalshi_order_side(order) or "YES"
    api_px = kalshi_order_average_fill_price_dollars(order)
    cost_eff: Optional[float] = None
    if fd > 1e-12 and fill_mag > 1e-12:
        cost_eff = _held_side_price_from_fill_average(fill_mag / fd, side)
    if (
        api_px > 0
        and fd > 1e-12
        and cost_eff is not None
        and abs(cost_eff - api_px) / max(api_px, 1e-6) > 0.12
    ):
        eff = _held_side_price_from_fill_average(api_px, side)
        total = max(0.0, eff * fd + fees)
        return (eff, total if total > 1e-12 else (eff * fd))
    if fd > 1e-12 and fill_mag > 1e-12:
        eff = _held_side_price_from_fill_average(fill_mag / fd, side)
        total = (fill_mag + fees) if (fill_mag + fees) > 0 else (eff * fd)
        return (eff, total)
    px = _kalshi_order_limit_fallback_per_contract_dollars(order)
    if fd > 0 and px > 0:
        total = (fill_mag + fees) if (fill_mag + fees) > 0 else (px * fd)
        return (px, total)
    vwap = kalshi_order_average_fill_price_dollars(order)
    if fd > 0 and vwap > 0:
        side = _kalshi_order_side(order) or "YES"
        eff = _held_side_price_from_fill_average(vwap, side)
        total = (eff * fd) + fees if fees > 0 else (eff * fd)
        return (eff, total)
    fb = max(1e-6, float(fallback_per_contract_dollars))
    return (fb, fb * fd if fd > 0 else 0.0)


def _held_side_price_from_order_leg(
    per_contract: float,
    *,
    order: Dict[str, Any],
    held_side: str,
) -> float:
    """Map fill $/contract on the order's ``side`` leg to the position's held leg (YES/NO complement)."""
    o_side = (_kalshi_order_side(order) or "YES").upper()
    h_side = (held_side or "YES").upper()
    px = max(0.0, min(1.0, float(per_contract or 0.0)))
    if o_side == h_side:
        return px
    return max(0.0, min(1.0, 1.0 - px))


def kalshi_order_avg_contract_price_and_proceeds_for_held_side(
    order: Dict[str, Any],
    *,
    held_side: str,
    filled: float,
    fallback_per_contract_dollars: float,
) -> Tuple[float, float]:
    """Sell/exit proceeds in **held-side** $/contract (handles Kalshi opposite-leg fills, e.g. buy YES to close NO)."""
    eff, _net = kalshi_order_avg_contract_price_and_proceeds(
        order,
        filled=filled,
        fallback_per_contract_dollars=fallback_per_contract_dollars,
    )
    eff = _held_side_price_from_order_leg(eff, order=order, held_side=held_side)
    fd = max(0.0, float(filled))
    fees = kalshi_order_fees_dollars(order)
    net = max(0.0, eff * fd - fees) if fd > 1e-12 else 0.0
    return eff, net


def kalshi_order_avg_contract_price_and_cost_for_held_side(
    order: Dict[str, Any],
    *,
    held_side: str,
    filled: float,
    fallback_per_contract_dollars: float,
) -> Tuple[float, float]:
    """Buy/entry cost in **held-side** $/contract (handles complementary Kalshi order legs)."""
    eff, total = kalshi_order_avg_contract_price_and_cost(
        order,
        filled=filled,
        fallback_per_contract_dollars=fallback_per_contract_dollars,
    )
    eff = _held_side_price_from_order_leg(eff, order=order, held_side=held_side)
    fd = max(0.0, float(filled))
    fees = kalshi_order_fees_dollars(order)
    total = max(0.0, eff * fd + fees) if fd > 1e-12 else 0.0
    return eff, total


def kalshi_order_avg_contract_price_and_proceeds(
    order: Dict[str, Any],
    *,
    filled: float,
    fallback_per_contract_dollars: float,
) -> Tuple[float, float]:
    """Per-contract average sell fill and total proceeds (for sell ledger / realized P&L).

    Prefer **fill proceeds** ``|taker+maker fill cost| / filled`` when it agrees with Kalshi's
    ``average_fill_price*`` fields. If those diverge by more than 12% relative, trust the API VWAP and set
    net proceeds to ``eff × filled − fees`` (some GET-order payloads mis-state fill cost vs size).
    IOC **limit** leg prices are only used when both fill cost and VWAP are missing.
    """
    fd = max(0.0, float(filled))
    # Kalshi often reports **negative** ``taker_fill_cost_dollars`` on sells (credit / proceeds).
    # The old ``fill_proceeds > 1e-12`` guard skipped that path and fell back to IOC limit fields,
    # where ``no_price`` can be the opposite leg (~93¢) while the YES exit was ~7¢ — corrupting
    # ``exit_price`` / ``realized_pnl`` vs Kalshi's trade history.
    fill_raw = kalshi_order_fill_cost_dollars(order)
    fees = kalshi_order_fees_dollars(order)
    fill_mag = abs(float(fill_raw))
    conv_px = _sell_positive_fill_as_opposite_leg_to_held_side_price(order, fd=fd, fees_dollars=fees)
    if conv_px is not None:
        eff = float(conv_px)
        net = max(0.0, eff * fd - fees)
        return (eff, net if net > 1e-12 else max(0.0, eff * fd - fees))
    side = _kalshi_order_side(order) or "YES"
    api_px = kalshi_order_average_fill_price_dollars(order)
    cost_eff: Optional[float] = None
    if fd > 1e-12 and fill_mag > 1e-12:
        cost_eff = _held_side_price_from_fill_average(fill_mag / fd, side)
    if (
        api_px > 0
        and fd > 1e-12
        and cost_eff is not None
        and abs(cost_eff - api_px) / max(api_px, 1e-6) > 0.12
    ):
        eff = _held_side_price_from_fill_average(api_px, side)
        net = max(0.0, eff * fd - fees)
        return (eff, net if net > 1e-12 else max(0.0, eff * fd - fees))
    if fd > 1e-12 and fill_mag > 1e-12:
        eff = _held_side_price_from_fill_average(fill_mag / fd, side)
        net = max(0.0, fill_mag - fees)
        return (eff, net if net > 1e-12 else max(0.0, eff * fd - fees))
    px = _kalshi_order_limit_fallback_per_contract_dollars(order)
    if fd > 0 and px > 0:
        net = (fill_mag - fees) if fill_mag > 1e-12 else (px * fd - fees)
        return (px, net if net != 0 else (px * fd))
    vwap = kalshi_order_average_fill_price_dollars(order)
    if fd > 0 and vwap > 0:
        side = _kalshi_order_side(order) or "YES"
        eff = _held_side_price_from_fill_average(vwap, side)
        return (eff, (eff * fd) - fees if fees > 0 else (eff * fd))
    fb = max(1e-6, float(fallback_per_contract_dollars))
    return (fb, fb * fd if fd > 0 else 0.0)


def kalshi_order_remaining_contracts(order: Dict[str, Any]) -> float:
    """Contracts still open on a Kalshi order (``remaining_count_fp``)."""
    return _fp_count(order.get("remaining_count_fp"))


def dollars_to_yes_no_limit_cents(limit_price_dollars: float) -> int:
    """Kalshi binary contract limit price as integer cents (1–99)."""
    return max(1, min(99, int(round(float(limit_price_dollars) * 100))))


def _yes_no_limit_price_field(side: str, cents: int) -> Dict[str, int]:
    if side.upper() == "YES":
        return {"yes_price": cents}
    return {"no_price": cents}


def _yes_no_limit_price_dollars_field(side: str, dollars_str: str) -> Dict[str, str]:
    """Exactly one of ``yes_price_dollars`` / ``no_price_dollars`` (Kalshi create-order constraint)."""
    key = "yes_price_dollars" if side.upper() == "YES" else "no_price_dollars"
    return {key: (dollars_str or "").strip()}


def best_orderbook_native_bid_dollars_string(orderbook_api_json: Optional[Dict[str, Any]], side: str) -> Optional[str]:
    """Best **native** bid for ``side`` from ``GET /markets/{{ticker}}/orderbook`` (first level = best).

    Kalshi returns bid ladders only; parity-inferred bids from ``GET /markets/{{ticker}}`` can disagree
    with matchable size at IOC time — prefer this for exit pricing when present.
    """
    if not orderbook_api_json or not isinstance(orderbook_api_json, dict):
        return None
    ob = orderbook_api_json.get("orderbook_fp") or orderbook_api_json.get("orderbook")
    if not isinstance(ob, dict):
        return None
    su = (side or "").upper()
    key = "yes_dollars" if su == "YES" else "no_dollars"
    levels = ob.get(key) or []
    if not isinstance(levels, list) or not levels:
        return None
    first = levels[0]
    if not isinstance(first, (list, tuple)) or len(first) < 1:
        return None
    ds = str(first[0]).strip()
    try:
        if float(ds) <= 0.0:
            return None
    except (TypeError, ValueError):
        return None
    return ds


def _exit_price_kw_signature(kw: Dict[str, Any]) -> Tuple[str, ...]:
    """Stable key for deduplicating IOC exit payloads (one price field)."""
    return tuple(sorted((k, str(v)) for k, v in kw.items()))


def live_best_ask_dollars(market: Dict[str, Any], side: str) -> Optional[float]:
    """Best actionable ask for ``YES`` or ``NO`` (fallback to mid); ``None`` if unknown."""
    su = side.upper()
    if su == "YES":
        ask_px = float(market.get("yes_ask") or 0.0)
        if ask_px <= 0:
            ask_px = float(market.get("yes_price") or 0.0)
    elif su == "NO":
        ask_px = float(market.get("no_ask") or 0.0)
        if ask_px <= 0:
            ask_px = float(market.get("no_price") or 0.0)
    else:
        return None
    return ask_px if ask_px > 0 else None


def executable_buy_best_ask_dollars(market: Dict[str, Any], side: str) -> Optional[float]:
    """Native top-of-book ask for IOC buys only — **no** ``yes_price`` / ``no_price`` fallback."""
    su = side.upper()
    if su == "YES":
        ask_px = float(market.get("yes_ask") or 0.0)
    elif su == "NO":
        ask_px = float(market.get("no_ask") or 0.0)
    else:
        return None
    if ask_px <= 0:
        return None
    return max(0.0, min(1.0, ask_px))


def live_ioc_buy_cap_dollars(market: Dict[str, Any], side: str) -> Optional[float]:
    """IOC buy limit from the book: ``min(99¢, ask)``. ``None`` if no ask."""
    ask_px = executable_buy_best_ask_dollars(market, side)
    if ask_px is None:
        return None
    return min(0.99, ask_px)


def buy_side_liquidity_skip_summary(
    market: Dict[str, Any],
    side: str,
    *,
    max_spread: float,
    min_top_size: float,
) -> Optional[str]:
    """If a BUY on ``side`` fails scan/trade liquidity gates, return a ``Skipped — …`` summary; else ``None``."""
    su = (side or "").upper()
    if su == "YES":
        bid = float(market.get("yes_bid") or 0.0)
        ask = float(market.get("yes_ask") or 0.0)
        spread = float(market.get("yes_spread") or 1.0)
        ask_size = float(market.get("yes_ask_size") or 0.0)
    elif su == "NO":
        bid = float(market.get("no_bid") or 0.0)
        ask = float(market.get("no_ask") or 0.0)
        spread = float(market.get("no_spread") or 1.0)
        ask_size = float(market.get("no_ask_size") or 0.0)
    else:
        return "Skipped — invalid trade side"

    if bid <= 0.0 and ask > 0.0 and ask < 0.95:
        return "Skipped — not enough bid liquidity"
    if bid > 0.0 and ask > 0.0 and spread > max_spread:
        return "Skipped — bid/ask spread too wide"
    if ask > 0.0 and ask_size < min_top_size:
        return "Skipped — order book too thin"
    return None


def _kalshi_raw_sent_last_trade_price(raw: Dict[str, Any]) -> bool:
    """True when the REST payload included an explicit last-trade field (may be zero)."""
    for k in ("last_price_dollars", "last_price"):
        v = raw.get(k)
        if v is None:
            continue
        if isinstance(v, str) and not str(v).strip():
            continue
        return True
    return False


def _yes_last_from_last_price_fields_only(market: Dict[str, Any]) -> Optional[float]:
    """Parse YES last trade (0–1) from ``last_price_dollars`` / ``last_price`` when present.

    Used for raw/minimal dicts without :func:`KalshiClient._normalize_market` (e.g. tests).
    Mirrors ``_normalize_market`` ``to_price`` cents-vs-dollar heuristic.
    """
    for key in ("last_price_dollars", "last_price"):
        raw = market.get(key)
        if raw is None:
            continue
        if isinstance(raw, str) and not str(raw).strip():
            continue
        try:
            f = float(raw)
        except (TypeError, ValueError):
            continue
        if f == 0.0:
            return 0.0
        v = f / 100.0 if f > 1.5 else f
        return max(0.0, min(1.0, v))
    return None


def open_position_estimated_mark_dollars(market: Dict[str, Any], side: str) -> Optional[float]:
    """Dashboard mark aligned with Kalshi **last trade** on YES (not liquidation).

    Uses normalized ``yes_last`` when ``has_last_trade`` is set (from ``last_price_dollars`` /
    ``last_price`` on the wire). YES → that value; NO → ``1 − YES``. Returns ``None`` if Kalshi sent
    no last-trade field — callers fall back to bid / executable mark.

    Execution / IOC exits must continue to use :func:`open_position_mark_dollars` (native bids only).
    """
    su = (side or "").upper()
    if su not in ("YES", "NO"):
        return None

    yes_px: Optional[float] = None
    if market.get("has_last_trade"):
        try:
            yl = float(market.get("yes_last") or 0.0)
        except (TypeError, ValueError):
            yl = 0.0
        yes_px = max(0.0, min(1.0, yl))
    else:
        yes_px = _yes_last_from_last_price_fields_only(market)

    if yes_px is None:
        return None
    if su == "YES":
        return yes_px
    return max(0.0, min(1.0, 1.0 - yes_px))


def open_position_mark_dollars(
    market: Dict[str, Any],
    side: str,
    orderbook_api_json: Optional[Dict[str, Any]] = None,
) -> float:
    """Liquidation mark for open longs: **observable** bid only (no parity, no ``yes_price`` composite).

    1. Best native bid string from ``GET …/orderbook`` when ``orderbook_api_json`` is passed.
    2. Else REST snapshot ``yes_bid`` / ``no_bid`` only.

    Parity-inferred bids and ``yes_price``/``no_price`` fallbacks are **not** used — those produced
    phantom ~1¢ marks when the real book had no bids (dead markets).

    Buys use :func:`executable_buy_best_ask_dollars` for IOC entry; this helper is **only** for MTM of holdings.
    """
    ds = best_orderbook_native_bid_dollars_string(orderbook_api_json, side)
    if ds:
        try:
            v = float(ds)
            if v > 0:
                return max(0.0, min(1.0, float(v)))
        except (TypeError, ValueError):
            pass
    su = (side or "").upper()
    if su == "YES":
        v = float(market.get("yes_bid") or 0.0)
    elif su == "NO":
        v = float(market.get("no_bid") or 0.0)
    else:
        return 0.0
    return max(0.0, min(1.0, float(v))) if v > 0 else 0.0


def live_best_bid_dollars(
    market: Dict[str, Any],
    side: str,
    *,
    fallback: float = 0.0,
    infer_from_opposite_ask: bool = True,
) -> Optional[float]:
    """Executable best bid for ``YES`` or ``NO``; ``None`` if unusable.

    Kalshi payloads often omit explicit bids on one leg of a binary market. Use parity from the
    opposite ask when needed (approximate executable contra liquidity):

    * NO bid ≈ ``1 - yes_ask``
    * YES bid ≈ ``1 - no_ask``

    When ``infer_from_opposite_ask=False``, only **native** bid columns are used (plus last-price
    fallback). IOC exits can see phantom liquidity from parity while fills stay zero — pair that
    mode with ``awaiting_settlement`` instead of spinning IOC retries.
    """
    su = side.upper()
    if su == "YES":
        bid_px = float(market.get("yes_bid") or 0.0)
        if bid_px <= 0 and infer_from_opposite_ask:
            no_ask = float(market.get("no_ask") or 0.0)
            if 0.0 < no_ask < 1.0:
                bid_px = 1.0 - no_ask
        if bid_px <= 0:
            bid_px = float(market.get("yes_price") or 0.0)
    elif su == "NO":
        bid_px = float(market.get("no_bid") or 0.0)
        if bid_px <= 0 and infer_from_opposite_ask:
            yes_ask = float(market.get("yes_ask") or 0.0)
            if 0.0 < yes_ask < 1.0:
                bid_px = 1.0 - yes_ask
        if bid_px <= 0:
            bid_px = float(market.get("no_price") or 0.0)
    else:
        return None
    if bid_px <= 0:
        bid_px = float(fallback or 0.0)
    return bid_px if bid_px > 0 else None


def native_bids_available_for_exit(
    orderbook_api_json: Optional[Dict[str, Any]],
    market: Dict[str, Any],
    side: str,
) -> bool:
    """True when the held side shows an actual bid level (orderbook row or REST ``yes_bid``/``no_bid``).

    Does **not** use ``yes_price`` / ``no_price`` composites or parity inference — those mismatch strict
    liquidation marks and could clear ``dead_market`` while the bid column stays at 0¢.
    """
    if best_orderbook_native_bid_dollars_string(orderbook_api_json, side):
        return True
    su = (side or "").upper()
    if su == "YES":
        return float(market.get("yes_bid") or 0.0) > 0.0
    if su == "NO":
        return float(market.get("no_bid") or 0.0) > 0.0
    return False


def resting_buy_collateral_estimate_usd(orders: List[Dict[str, Any]]) -> float:
    """Upper-bound cash tied up in resting **buy** orders (remaining qty × limit price on that side).

    Uses Kalshi order objects from ``GET /portfolio/orders``. This is an estimate for UI / sizing;
    exchange balance semantics may differ slightly.
    """
    total = 0.0
    for o in orders:
        if (o.get("status") or "").lower() != "resting":
            continue
        if (o.get("action") or "").lower() != "buy":
            continue
        rem = kalshi_order_remaining_contracts(o)
        if rem <= 0:
            continue
        side = (o.get("side") or "").lower()
        px = 0.0

        # Legacy schema: yes/no side with explicit price fields.
        if side == "yes":
            px = _fp_dollars(o.get("yes_price_dollars"))
        elif side == "no":
            px = _fp_dollars(o.get("no_price_dollars"))
        # V2-compatible shape: bid/ask on YES with a single ``price`` field.
        elif side in ("bid", "ask"):
            yes_px = _fp_dollars(o.get("price_dollars") or o.get("price"))
            if 0.0 < yes_px < 1.0:
                # Buying NO is represented as "ask" on YES at yes_px.
                px = yes_px if side == "bid" else (1.0 - yes_px)
        else:
            continue

        if px > 0:
            total += rem * px
    return total


def _fp_dollars_str(v: float, *, places: int = 6) -> str:
    """Format a dollars float as Kalshi FixedPointDollars string.

    For order placement we prefer a stable fixed precision string (no trimming) so the server's
    precision validator behaves consistently across markets.
    """
    try:
        x = float(v)
    except Exception:
        x = 0.0
    x = max(0.0, min(1.0, x))
    p = max(0, min(6, int(places)))
    return f"{x:.{p}f}"


def _count_fp_str(q: int) -> str:
    """Whole-contract count as FixedPointCount string."""
    return f"{max(0, int(q))}.00"


def _v2_book_side_and_yes_price(
    action: str,
    side_yesno: str,
    limit_price_dollars: float,
) -> Tuple[str, float]:
    """Map legacy (action, YES/NO, limit) -> V2 BookSide + YES-leg limit dollars."""
    su = (side_yesno or "").upper()
    act = (action or "").lower()
    px = max(0.0, min(1.0, float(limit_price_dollars)))
    if su not in ("YES", "NO") or act not in ("buy", "sell"):
        return "bid", px
    if su == "YES":
        return ("bid" if act == "buy" else "ask"), px
    # NO: buy NO == sell YES at (1 - no_px); sell NO == buy YES at (1 - no_px)
    yes_px = max(0.0, min(1.0, 1.0 - px))
    return ("ask" if act == "buy" else "bid"), yes_px


def _first_event_ticker(raw: Dict[str, Any]) -> str:
    et = raw.get("event_ticker")
    if et:
        return str(et).strip()
    ev = raw.get("event_tickers")
    if isinstance(ev, list) and ev:
        return str(ev[0]).strip()
    return ""


class KalshiClient:
    """Kalshi REST v2 client (RSA-PSS signing): markets, portfolio, IOC buys, legacy market exits."""

    _RESTING_ORDERS_CACHE_TTL_SEC = 4.0
    _SETTLEMENTS_CACHE_TTL_SEC = 45.0
    _EVENT_CACHE_TTL_SEC = 300.0

    def __init__(
        self,
        api_key: str,
        private_key_path: str,
        base_url: str = "https://api.elections.kalshi.com",
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.private_key_path = private_key_path
        self.private_key = None
        # Cache to avoid duplicate concurrent pagination calls
        self._markets_cache: Optional[List[Dict]] = None
        self._markets_cache_ts: float = 0.0
        self._markets_lock = asyncio.Lock()
        self._resting_orders_cache: Optional[Tuple[float, List[Dict[str, Any]]]] = None
        self._settlements_cache: Optional[Tuple[float, List[Dict[str, Any]]]] = None
        self._event_title_cache: dict[str, Tuple[float, str]] = {}
        self._load_private_key()
        # Shared keep-alive pool — avoids per-request TLS handshakes (dashboard + bot + reconcile).
        self._http = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=32, max_connections=64),
            timeout=httpx.Timeout(45.0, connect=15.0),
        )
        self._MARKET_DETAIL_CACHE_TTL_SEC = 5.0
        self._market_detail_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._market_detail_lock = asyncio.Lock()
        # When ``max_close_ts``-bounded scans cap at ``max_aggregate_kept``, continue from this cursor next fetch.
        self._markets_list_resume_key: Optional[str] = None
        self._markets_list_resume_cursor: Optional[str] = None

    async def aclose(self) -> None:
        """Close the HTTP pool (call from app shutdown). Safe to call multiple times."""
        if getattr(self, "_http", None) is None:
            return
        try:
            await self._http.aclose()
        finally:
            self._http = None

    def invalidate_market_detail_cache(self, ticker: Optional[str] = None) -> None:
        """Drop cached ``get_market`` rows (after our fills/exits so next read sees fresh book)."""
        if not ticker:
            self._market_detail_cache.clear()
            return
        k = normalize_market_id(str(ticker)).strip().upper()
        self._market_detail_cache.pop(k, None)

    async def _http_get_signed(self, path: str, *, params: Optional[Dict[str, Any]] = None, timeout: float = 20.0):
        url = f"{self.base_url}{path}"
        auth_path = path.split("?", 1)[0]
        return await self._http.get(
            url,
            params=params,
            headers=self._get_auth_headers("GET", auth_path),
            timeout=timeout,
        )

    async def _http_post_signed_json(self, path: str, body: Dict[str, Any], *, timeout: float = 15.0):
        url = f"{self.base_url}{path}"
        auth_path = path.split("?", 1)[0]
        hdr = {"Content-Type": "application/json", **self._get_auth_headers("POST", auth_path)}
        return await self._http.post(url, json=body, headers=hdr, timeout=timeout)

    async def _http_delete_signed(self, path: str, *, timeout: float = 10.0):
        url = f"{self.base_url}{path}"
        auth_path = path.split("?", 1)[0]
        return await self._http.delete(url, headers=self._get_auth_headers("DELETE", auth_path), timeout=timeout)

    def invalidate_resting_orders_cache(self) -> None:
        """Clear cached resting-order list (call after mass-cancel or when freshness is required)."""
        self._resting_orders_cache = None

    def invalidate_settlements_cache(self) -> None:
        """Clear cached settlements list (call after reconciliation closes local positions)."""
        self._settlements_cache = None

    # ── Auth ──────────────────────────────────────────────────────────────────

    def _load_private_key(self) -> None:
        try:
            with open(self.private_key_path, "rb") as f:
                self.private_key = serialization.load_pem_private_key(f.read(), password=None)
            logger.info("Private key loaded from %s", self.private_key_path)
        except Exception as e:
            logger.warning("Could not load private key from %s: %s", self.private_key_path, e)

    def _get_auth_headers(self, method: str, path: str) -> Dict[str, str]:
        """Build Kalshi v2 RSA-signed auth headers.

        Per Kalshi docs, the signed path must **omit query strings** — sign ``/trade-api/v2/...``
        only, even when the HTTP URL includes ``?limit=...``.
        """
        if not self.private_key or not self.api_key:
            return {}
        timestamp_ms = str(int(time.time() * 1000))
        path_to_sign = path.split("?", 1)[0]
        msg = timestamp_ms + method.upper() + path_to_sign
        signature = self.private_key.sign(
            msg.encode(),
            padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
            hashes.SHA256(),
        )
        return {
            "KALSHI-ACCESS-KEY": self.api_key,
            "KALSHI-ACCESS-SIGNATURE": base64.b64encode(signature).decode(),
            "KALSHI-ACCESS-TIMESTAMP": timestamp_ms,
        }

    def _has_credentials(self) -> bool:
        return bool(self.api_key and self.private_key)

    # ── Field normalisation ───────────────────────────────────────────────────

    def _normalize_market(self, raw: dict) -> dict:
        """Map Kalshi v2 API field names to internal shape.

        Kalshi v2 uses *_dollars suffix for price fields (string decimals, e.g. "0.45")
        and *_fp suffix for volume (FixedPoint string contract counts, e.g. "1500.00").
        Status is "active" (not "open") for tradeable markets.
        """
        def to_price(v) -> float:
            """Convert a price field to 0–1 fraction. Handles both decimal and cents formats."""
            if v is None:
                return 0.0
            try:
                f = float(v)
                if f == 0.0:
                    return 0.0
                return f / 100.0 if f > 1.5 else f
            except Exception:
                return 0.0

        def to_fp(v) -> float:
            if v is None:
                return 0.0
            try:
                return float(v)
            except Exception:
                return 0.0

        def first_nonzero(*sources) -> float:
            for v in sources:
                p = to_price(v)
                if p > 0.0:
                    return p
            return 0.0

        # Kalshi v2 price fields — prefer bid (executable), fall back to ask, then last
        yes_bid = first_nonzero(raw.get("yes_bid_dollars"), raw.get("yes_bid"))
        yes_ask = first_nonzero(raw.get("yes_ask_dollars"), raw.get("yes_ask"))
        no_bid = first_nonzero(raw.get("no_bid_dollars"), raw.get("no_bid"))
        no_ask = first_nonzero(raw.get("no_ask_dollars"), raw.get("no_ask"))

        # Kalshi books are often bid-only. Infer missing asks from parity with the opposite bid:
        # - YES ask ≈ 1 - NO bid
        # - NO ask  ≈ 1 - YES bid
        if yes_ask <= 0.0 and 0.0 < no_bid < 1.0:
            yes_ask = round(1.0 - no_bid, 4)
        if no_ask <= 0.0 and 0.0 < yes_bid < 1.0:
            no_ask = round(1.0 - yes_bid, 4)

        yes_bid_size = to_fp(raw.get("yes_bid_size_fp"))
        yes_ask_size = to_fp(raw.get("yes_ask_size_fp"))
        no_bid_size = to_fp(raw.get("no_bid_size_fp"))
        no_ask_size = to_fp(raw.get("no_ask_size_fp"))

        # Kalshi orderbooks are bid-only: a YES bid at X ⇔ an NO ask at (1−X) with the same size,
        # and a NO bid at Y ⇔ a YES ask at (1−Y) with the same size. Market list payloads often
        # omit *_ask_size_fp on one side; derive missing depth from the reciprocal bid size.
        if yes_ask_size <= 0.0 and no_bid_size > 0.0:
            yes_ask_size = no_bid_size
        if no_ask_size <= 0.0 and yes_bid_size > 0.0:
            no_ask_size = yes_bid_size

        # Distinguish "mark/last" from executable prices so portfolio valuation matches Kalshi UI.
        has_last_trade = _kalshi_raw_sent_last_trade_price(raw)
        yes_last = first_nonzero(raw.get("last_price_dollars"), raw.get("last_price"))
        yes_price = first_nonzero(
            raw.get("yes_bid_dollars"), raw.get("yes_ask_dollars"), raw.get("last_price_dollars"),
            raw.get("yes_bid"), raw.get("yes_ask"), raw.get("last_price"),  # older format fallback
        )
        no_price = first_nonzero(
            raw.get("no_bid_dollars"), raw.get("no_ask_dollars"),
            raw.get("no_bid"), raw.get("no_ask"),
        )
        if no_price == 0.0 and yes_price > 0.0:
            no_price = round(1.0 - yes_price, 4)
        no_last = round(1.0 - yes_last, 4) if yes_last > 0 else 0.0

        yes_spread = (yes_ask - yes_bid) if (yes_ask > 0 and yes_bid > 0) else 1.0
        no_spread = (no_ask - no_bid) if (no_ask > 0 and no_bid > 0) else 1.0

        # Contractual settlement horizon (Kalshi UI / legal close) — kept for DB positions & lifecycle.
        contractual_close = (
            raw.get("close_time")
            or raw.get("expiration_time")
            or raw.get("latest_expiration_time")
        )

        def _parse_iso_dt(val: object) -> Optional[datetime]:
            if val is None:
                return None
            s = str(val).strip()
            if not s:
                return None
            try:
                dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except Exception:
                return None

        now_utc = datetime.now(timezone.utc)
        # Resolution-ish timestamps we may vet against (do **not** use open_time — usually far in the past).
        short_candidates: List[datetime] = []
        for key in ("occurrence_datetime", "expected_expiration_time"):
            dt = _parse_iso_dt(raw.get(key))
            if dt is None:
                continue
            # Ignore Kalshi-style placeholder / garbage extremes
            if dt.year < 2020 or dt > now_utc + timedelta(days=3650):
                continue
            short_candidates.append(dt)
        vet_dt = min(short_candidates) if short_candidates else None
        vetting_horizon_time: Optional[str] = None
        if vet_dt is not None:
            vetting_horizon_time = (
                vet_dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")
            )

        close_time = contractual_close
        expires_in_days = None
        horizon_iso = vetting_horizon_time or contractual_close
        if horizon_iso:
            try:
                ct = datetime.fromisoformat(str(horizon_iso).replace("Z", "+00:00"))
                delta = ct - datetime.now(timezone.utc)
                expires_in_days = max(0.0, delta.total_seconds() / 86400.0)
            except Exception:
                pass

        # Volume (contracts): bulk ``GET /markets`` rows often have weak/zero 24h while lifetime/open_interest
        # is healthy — take the **max** across known numeric fields so vetting matches reality.
        volume = 0.0
        for vfield in (
            "volume_24h_fp",
            "volume_fp",
            "volume_24h",
            "volume",
            "open_interest_fp",
            "open_interest",
        ):
            raw_v = raw.get(vfield)
            if raw_v is None:
                continue
            try:
                v = float(raw_v)
                if v > volume:
                    volume = v
            except Exception:
                pass

        # Kalshi trade-api lifecycle: active → closed (trading stopped, outcome not yet official) →
        # determined (yes/no known, settlement pending) → finalized / settled (terminal). Raw ``status`` lowercased.
        raw_status = raw.get("status", "")
        status = "open" if raw_status == "active" else raw_status

        api_status_l = str(raw_status or "").strip().lower()
        res_raw = str(raw.get("result") or "").strip().lower()
        resolution_result = res_raw if res_raw in ("yes", "no") else ""
        # Kalshi's schema allows ``result: ""`` even after determination; ``settlement_value_dollars``
        # is documented as the YES/LONG payout (0 vs 1 for binaries) once the market is determined.
        if not resolution_result:
            mt = str(raw.get("market_type") or "binary").strip().lower()
            if mt == "binary":
                sv_raw = raw.get("settlement_value_dollars")
                if sv_raw is not None and str(sv_raw).strip() != "":
                    try:
                        sv = float(str(sv_raw).strip())
                        if sv >= 0.99:
                            resolution_result = "yes"
                        elif sv <= 0.01:
                            resolution_result = "no"
                    except (TypeError, ValueError):
                        pass

        return {
            "id":              raw.get("ticker", raw.get("id", "")),
            "title":           raw.get("title", ""),
            "event_ticker":    _first_event_ticker(raw),
            "series_ticker":   raw.get("series_ticker") or "",
            "subtitle":        raw.get("subtitle") or raw.get("yes_sub_title", ""),
            "category":        raw.get("category", ""),
            "yes_price":       yes_price,
            "no_price":        no_price,
            "yes_last":        yes_last,
            "no_last":         no_last,
            "has_last_trade":  has_last_trade,
            "yes_bid":         yes_bid,
            "yes_ask":         yes_ask or yes_price,
            "no_bid":          no_bid,
            "no_ask":          no_ask or no_price,
            "yes_bid_size":    yes_bid_size,
            "yes_ask_size":    yes_ask_size,
            "no_bid_size":     no_bid_size,
            "no_ask_size":     no_ask_size,
            "yes_spread":      yes_spread,
            "no_spread":       no_spread,
            "volume":          volume,
            "status":          status,
            "can_close_early": raw.get("can_close_early", True),
            "market_type":     raw.get("market_type", "binary"),
            "close_time":      close_time,
            "occurrence_datetime": raw.get("occurrence_datetime"),
            "expected_expiration_time": raw.get("expected_expiration_time"),
            "vetting_horizon_time": vetting_horizon_time,
            "expires_in_days": expires_in_days,
            # Raw Kalshi lifecycle / resolution (not folded into ``status`` tradeable flag).
            "kalshi_api_status": api_status_l,
            "resolution_result": resolution_result,
            "strike_type": str(raw.get("strike_type") or "").strip(),
            "floor_strike": _optional_float(raw.get("floor_strike")),
            "cap_strike": _optional_float(raw.get("cap_strike")),
            "rules_primary": str(raw.get("rules_primary") or "").strip(),
            "rules_secondary": str(raw.get("rules_secondary") or "").strip(),
        }

    # ── Markets ───────────────────────────────────────────────────────────────

    async def get_markets(self, filters: Optional[Dict[str, Any]] = None) -> List[Dict]:
        """Get available binary markets via cursor-based pagination, skipping MVE containers.

        Results are cached for 20 seconds to prevent concurrent callers from each
        doing their own full multi-page fetch.
        """
        cache_ttl = 20.0
        now = time.monotonic()
        # Return cached result if fresh and no custom filters requested
        if not filters and self._markets_cache is not None and (now - self._markets_cache_ts) < cache_ttl:
            return self._markets_cache

        async with self._markets_lock:
            # Re-check after acquiring lock (another co-routine may have just refreshed)
            now = time.monotonic()
            if not filters and self._markets_cache is not None and (now - self._markets_cache_ts) < cache_ttl:
                return self._markets_cache

            result = await self._fetch_markets_paginated(filters)
            if not filters:
                self._markets_cache = result
                self._markets_cache_ts = time.monotonic()
            return result

    async def _fetch_markets_paginated(
        self,
        filters: Optional[Dict[str, Any]] = None,
        *,
        _retry_without_resume: bool = False,
    ) -> List[Dict]:
        """Internal: paginate Kalshi ``/markets``; for ``max_close_ts``-bounded scans, rotate the starting
        API cursor across ticks so each pass can walk a different 8k-kept slice before local filters run.
        """
        path = "/trade-api/v2/markets"
        all_normalized: List[Dict] = []
        seen_ids: Set[str] = set()
        resume_key = _markets_list_resume_bucket_key(filters)
        first_page_cursor: Optional[str] = None
        if resume_key is None:
            self._markets_list_resume_cursor = None
            self._markets_list_resume_key = None
        else:
            if resume_key != getattr(self, "_markets_list_resume_key", None):
                self._markets_list_resume_cursor = None
            self._markets_list_resume_key = resume_key
            if not _retry_without_resume:
                first_page_cursor = self._markets_list_resume_cursor

        next_cursor: Optional[str] = first_page_cursor
        # Kalshi docs: limit supports up to 1000 per page. Broad ``max_close_ts`` filters often yield a
        # low-volume-first cursor page; we must walk pages until the cursor ends (capped) so liquid markets appear.
        max_pages = 20
        max_aggregate_kept = 8000

        try:
            for page_num in range(max_pages):
                params: Dict[str, Any] = {
                    "limit": 1000,
                    # Docs accept status=open filter but may return status=active in response.
                    "status": "open",
                    # Official filter to exclude MVE/container markets.
                    "mve_filter": "exclude",
                }
                if next_cursor:
                    params["cursor"] = next_cursor
                if filters:
                    params.update(filters)

                response = await self._http_get_signed(path, params=params, timeout=45.0)
                if response.status_code in (401, 403):
                    logger.error(
                        "Kalshi auth failed (%d) — verify KALSHI_API_KEY and that KALSHI_PRIVATE_KEY_PATH points to a valid PEM in backend/",
                        response.status_code,
                    )
                    return []
                response.raise_for_status()
                data = response.json()
                raw_markets = data.get("markets", [])

                if not raw_markets:
                    if page_num == 0 and first_page_cursor and not _retry_without_resume:
                        logger.warning(
                            "Kalshi markets list resume cursor returned empty page — clearing rotation and refetching from head",
                        )
                        self._markets_list_resume_cursor = None
                        return await self._fetch_markets_paginated(filters, _retry_without_resume=True)
                    self._markets_list_resume_cursor = None
                    break

                kept = 0
                skipped = 0
                for m in raw_markets:
                    n = self._normalize_market(m)
                    # Skip parlay/combo tickers — not standard binary markets (extra defense)
                    ticker_upper = n.get("id", "").upper()
                    if "CROSSCATEGORY" in ticker_upper or "MULTIGAME" in ticker_upper or "KXMVE" in ticker_upper:
                        skipped += 1
                        continue
                    # Skip markets with no executable price (non-tradeable placeholders)
                    if n.get("yes_price", 0) <= 0:
                        skipped += 1
                        continue
                    # Prefer binary markets only (Kalshi supports scalar too)
                    if n.get("market_type") != "binary":
                        skipped += 1
                        continue
                    tid_key = str(n.get("id") or "").strip().upper()
                    if tid_key and tid_key in seen_ids:
                        continue
                    if tid_key:
                        seen_ids.add(tid_key)
                    all_normalized.append(n)
                    kept += 1

                next_cursor = data.get("cursor")
                skip_note = f" | skipped {skipped} no-price" if skipped else ""
                if page_num == 0 and raw_markets:
                    sample_ids = [self._normalize_market(m).get("id", "?") for m in raw_markets[:3]]
                    skip_note += f" | sample tickers: {sample_ids}"
                    if first_page_cursor:
                        skip_note += " | resumed_scan_cursor"
                cur_note = f" | cursor={next_cursor[:12]}..." if next_cursor else " | last page"
                logger.info(
                    "Kalshi page %d: %d raw -> %d kept%s%s",
                    page_num + 1, len(raw_markets), kept,
                    cur_note,
                    skip_note,
                )

                if not next_cursor:
                    self._markets_list_resume_cursor = None
                    break
                if len(all_normalized) >= max_aggregate_kept:
                    self._markets_list_resume_cursor = next_cursor
                    logger.info(
                        "Kalshi markets fetch capped at %d kept rows (more pages available; next scan continues cursor)",
                        max_aggregate_kept,
                    )
                    break
                # Brief pause between pages (configurable; 0 = none).
                _d = float(getattr(settings, "kalshi_markets_page_delay_sec", 0.05) or 0.0)
                if _d > 0:
                    await asyncio.sleep(_d)
            else:
                # Exhausted ``max_pages`` without natural end or cap — continue next scan from last cursor.
                if resume_key and next_cursor and len(all_normalized) < max_aggregate_kept:
                    self._markets_list_resume_cursor = next_cursor
                    logger.info(
                        "Kalshi markets fetch stopped after %d pages with cursor still present — will resume next scan",
                        max_pages,
                    )

            if all_normalized:
                # Rank markets for scan order: soonest vetting horizon first (among API-filtered window),
                # then volume and mid-range prices; deprioritize last ~3h (spread/noise).
                def _rank(m: Dict[str, Any]) -> tuple:
                    vol = float(m.get("volume") or 0.0)
                    yes_p = float(m.get("yes_price") or 0.0)
                    price_mid = 1.0 - abs(yes_p - 0.5)  # higher is closer to 0.5
                    horizon = m.get("vetting_horizon_time") or m.get("close_time")
                    mins_left = 10**9
                    if horizon:
                        try:
                            ct = datetime.fromisoformat(str(horizon).replace("Z", "+00:00"))
                            mins_left = max(0, int((ct - datetime.now(timezone.utc)).total_seconds() / 60))
                        except Exception:
                            pass
                    # Prefer not-too-imminent closes (avoid last-minute noise/fills)
                    imminence_penalty = 1 if mins_left < 180 else 0
                    return (imminence_penalty, mins_left, -vol, -price_mid)

                all_normalized.sort(key=_rank)

                s = all_normalized[0]
                logger.info(
                    "Sample ranked: id=%s yes_price=%.3f no_price=%.3f volume=%.1f status=%s",
                    s.get("id"), s.get("yes_price", 0), s.get("no_price", 0),
                    s.get("volume", 0), s.get("status"),
                )
                logger.info("Fetched %d candidate binary markets from Kalshi", len(all_normalized))
                return all_normalized

            logger.warning("No tradeable markets found after %d pages — check API filters or account permissions", max_pages)
            return []

        except httpx.HTTPStatusError as e:
            logger.error("HTTP error fetching markets: %s", e.response.status_code)
            return []
        except Exception as e:
            logger.error("Error fetching markets: %s", e)
            return []

    async def get_market(self, ticker: str) -> Optional[Dict]:
        """Fetch a single market by ticker for price refresh."""
        key = normalize_market_id(str(ticker or "")).strip().upper()
        if not key:
            return None
        now = time.monotonic()
        async with self._market_detail_lock:
            hit = self._market_detail_cache.get(key)
            if hit is not None and (now - hit[0]) < float(self._MARKET_DETAIL_CACHE_TTL_SEC):
                return dict(hit[1])
        path = f"/trade-api/v2/markets/{ticker}"
        try:
            response = await self._http_get_signed(path, timeout=10.0)
            response.raise_for_status()
            normalized = self._normalize_market(response.json().get("market", {}))
            async with self._market_detail_lock:
                self._market_detail_cache[key] = (time.monotonic(), normalized)
            return normalized
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                logger.debug(
                    "Market book unavailable (ended/archived or unknown ticker): %s",
                    ticker,
                )
            else:
                logger.error("Error fetching market %s: %s", ticker, e)
            return None
        except Exception as e:
            logger.error("Error fetching market %s: %s", ticker, e)
            return None

    async def get_market_orderbook_fp(self, ticker: str, depth: int = 8) -> Optional[Dict[str, Any]]:
        """Raw JSON from ``GET /markets/{{ticker}}/orderbook`` (``orderbook_fp`` bid ladders)."""
        path = f"/trade-api/v2/markets/{ticker}/orderbook"
        params: Dict[str, str] = {}
        if depth and depth > 0:
            params["depth"] = str(min(100, max(1, int(depth))))
        try:
            response = await self._http_get_signed(path, params=params or None, timeout=12.0)
            response.raise_for_status()
            data = response.json()
            return data if isinstance(data, dict) else None
        except httpx.HTTPStatusError as e:
            logger.debug("Orderbook %s: HTTP %s", ticker, e.response.status_code)
            return None
        except Exception as e:
            logger.debug("Orderbook %s: %s", ticker, e)
            return None

    async def get_event_title(self, event_ticker: str) -> str:
        """Best-effort event title for UI (e.g., 'Highest temperature in LA today?').

        Market tickers (contracts) often don't include the city name in the contract title the same
        way the Kalshi UI presents it. Kalshi's UI groups contracts under an event title; this
        helper fetches that event title and caches it briefly.
        """
        et = (event_ticker or "").strip()
        if not et:
            return ""

        now = time.monotonic()
        hit = self._event_title_cache.get(et)
        if hit and (now - float(hit[0] or 0.0)) < float(self._EVENT_CACHE_TTL_SEC):
            return str(hit[1] or "")

        path = f"/trade-api/v2/events/{et}"
        try:
            response = await self._http_get_signed(path, timeout=10.0)
            response.raise_for_status()
            raw = response.json() or {}
            ev = raw.get("event") or raw
            title = (ev.get("title") or ev.get("event_title") or ev.get("name") or "").strip()
            self._event_title_cache[et] = (now, title)
            return title
        except httpx.HTTPStatusError as e:
            if e.response.status_code != 404:
                logger.debug("Event title fetch failed for %s: %s", et, e)
        except Exception as e:
            logger.debug("Event title fetch failed for %s: %s", et, e)
        self._event_title_cache[et] = (now, "")
        return ""

    # ── Portfolio ─────────────────────────────────────────────────────────────

    async def get_portfolio(self) -> Dict[str, Any]:
        """Get current portfolio balance (dollars)."""
        path = "/trade-api/v2/portfolio/balance"
        try:
            response = await self._http_get_signed(path, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            # Kalshi v2 schema variants:
            # - Top-level ints (cents): {"balance": 7348, "portfolio_value": 1461}
            #   where portfolio_value is positions market value (not total).
            # - Nested dict under "balance" with "available_balance" and possibly "portfolio_value".
            raw_bal = data.get("balance", 0)
            available_cents = 0.0
            positions_value_cents = 0.0

            if isinstance(raw_bal, dict):
                available_cents = float(raw_bal.get("available_balance", raw_bal.get("balance", 0)) or 0)
                pv = raw_bal.get("portfolio_value", None)
                if pv is not None:
                    try:
                        positions_value_cents = float(pv or 0)
                    except (TypeError, ValueError):
                        positions_value_cents = 0.0
            else:
                available_cents = float(raw_bal or 0)
                pv = data.get("portfolio_value", None)
                if pv is not None:
                    try:
                        positions_value_cents = float(pv or 0)
                    except (TypeError, ValueError):
                        positions_value_cents = 0.0

            out: Dict[str, Any] = {
                "cash": available_cents / 100.0,
                "positions_value": positions_value_cents / 100.0,
                "portfolio_value": (available_cents + positions_value_cents) / 100.0,
            }
            if isinstance(raw_bal, dict):
                # Surface numeric cents fields when present (Kalshi schema may evolve).
                for key in ("blocked_balance", "reserved_balance", "payout_balance"):
                    if key in raw_bal and raw_bal[key] is not None:
                        try:
                            out[f"{key}_usd"] = float(raw_bal[key]) / 100.0
                        except (TypeError, ValueError):
                            pass
            return out
        except Exception as e:
            logger.error("Error fetching portfolio: %s", e)
            return {"cash": 0.0, "portfolio_value": 0.0}

    async def get_positions(
        self,
        *,
        ticker: Optional[str] = None,
        count_filter: Optional[str] = "position,total_traded",
        page_limit: int = 250,
        max_pages: int = 60,
    ) -> List[Dict[str, Any]]:
        """Portfolio ``market_positions`` (paginated).

        Default ``count_filter=position,total_traded`` asks Kalshi for rows where either field is
        non-zero, which typically **includes settled markets** (zero position but prior traded volume).
        Without this, flat settled tickers can disappear from the list and local rows never close.
        """
        path_base = "/trade-api/v2/portfolio/positions"
        page_limit = max(1, min(1000, page_limit))

        async def _pull(cf: Optional[str]) -> List[Dict[str, Any]]:
            accum: List[Dict[str, Any]] = []
            cursor: Optional[str] = None
            for _ in range(max(1, max_pages)):
                qp: Dict[str, str] = {"limit": str(page_limit)}
                if cf:
                    qp["count_filter"] = cf
                if ticker:
                    qp["ticker"] = normalize_market_id(ticker)
                if cursor:
                    qp["cursor"] = cursor
                response = await self._http_get_signed(path_base, params=qp, timeout=20.0)
                response.raise_for_status()
                data = response.json()
                batch = data.get("market_positions") or []
                accum.extend(batch)
                next_cursor = (data.get("cursor") or "").strip()
                if not batch or not next_cursor:
                    break
                cursor = next_cursor
            return accum

        try:
            return await _pull(count_filter)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 400 and count_filter:
                logger.warning(
                    "get_positions rejected count_filter=%r (%s); retrying without filter",
                    count_filter,
                    e,
                )
                return await _pull(None)
            logger.error("Error fetching positions: %s", e)
            return []
        except Exception as e:
            logger.error("Error fetching positions: %s", e)
            return []

    async def get_settlements_for_ticker(self, ticker: str, *, limit: int = 100) -> List[Dict[str, Any]]:
        """Settlement rows for one market (helps when global settlement pagination misses a ticker)."""
        path_base = "/trade-api/v2/portfolio/settlements"
        t_eff = normalize_market_id(ticker)
        lim = max(1, min(1000, limit))
        try:
            response = await self._http_get_signed(
                path_base,
                params={"limit": str(lim), "ticker": t_eff},
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()
            return list(data.get("settlements") or [])
        except Exception as e:
            logger.warning("Error fetching settlements for ticker %s: %s", t_eff, e)
            return []

    async def get_settlements_paginated(
        self,
        *,
        page_limit: int = 250,
        max_pages: int = 30,
    ) -> List[Dict[str, Any]]:
        """Fetch recent settlement records (paginated). Used when markets disappear from ``GET /markets``."""
        path_base = "/trade-api/v2/portfolio/settlements"
        page_limit = max(1, min(1000, page_limit))
        accum: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        try:
            for _ in range(max(1, max_pages)):
                qp: Dict[str, str] = {"limit": str(page_limit)}
                if cursor:
                    qp["cursor"] = cursor
                response = await self._http_get_signed(path_base, params=qp, timeout=25.0)
                response.raise_for_status()
                data = response.json()
                batch = data.get("settlements") or []
                accum.extend(batch)
                next_cursor = (data.get("cursor") or "").strip()
                if not batch or not next_cursor:
                    break
                cursor = next_cursor
            return accum
        except Exception as e:
            logger.error("Error fetching settlements: %s", e)
            return []

    async def get_settlements_cached(self) -> List[Dict[str, Any]]:
        """Cached settlements list for reconciliation (bot loop + dashboard avoid hammering the API)."""
        hit = self._settlements_cache
        now = time.monotonic()
        if hit is not None and (now - hit[0]) < self._SETTLEMENTS_CACHE_TTL_SEC:
            return list(hit[1])
        rows = await self.get_settlements_paginated()
        self._settlements_cache = (now, list(rows))
        return rows

    # ── Orders ────────────────────────────────────────────────────────────────

    async def _post_create_order(
        self,
        payload: Dict[str, Any],
        log_label: str,
        *,
        add_client_order_id: bool = True,
        expected_probe_failure_status: Optional[int] = None,
    ) -> Dict[str, Any]:
        path = "/trade-api/v2/portfolio/orders"
        body = dict(payload)
        if add_client_order_id and "client_order_id" not in body:
            body["client_order_id"] = str(uuid.uuid4())
        try:
            response = await self._http_post_signed_json(path, body, timeout=15.0)
            response.raise_for_status()
            data = response.json()
            order = dict(data.get("order") or {})
            # Create-order often exposes VWAP on the envelope as well as inside ``order``.
            for key in ("average_fill_price", "average_fill_price_dollars"):
                if key in data and key not in order:
                    order[key] = data[key]
            logger.info(
                "%s kalshi_status=%s fill_fp=%s remaining_fp=%s",
                log_label,
                order.get("status"),
                order.get("fill_count_fp"),
                order.get("remaining_count_fp"),
            )
            return order
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                body = e.response.json()
                if isinstance(body, dict):
                    nested = body.get("error")
                    if isinstance(nested, dict):
                        detail = str(
                            nested.get("details")
                            or nested.get("message")
                            or nested.get("code")
                            or ""
                        ).strip()
                    if not detail:
                        detail = (
                            str(body.get("message") or body.get("details") or body.get("code") or "")
                            or e.response.text
                        )
                else:
                    detail = e.response.text
            except Exception:
                detail = e.response.text or str(e)
            detail = (detail or str(e)).strip()
            if len(detail) > 800:
                detail = detail[:800] + "…"
            code = int(e.response.status_code)
            if expected_probe_failure_status is not None and code == expected_probe_failure_status:
                logger.debug(
                    "Order probe rejected (%s): HTTP %s — %s (normal — fallback path may follow)",
                    log_label,
                    code,
                    detail,
                )
            else:
                logger.error(
                    "Create order failed (%s): HTTP %s — %s",
                    log_label,
                    code,
                    detail,
                )
            return {"error": f"HTTP {code}: {detail}"}
        except Exception as e:
            logger.error("Create order failed (%s): %s", log_label, e)
            return {"error": str(e)}

    async def _post_create_order_v2(
        self,
        *,
        ticker: str,
        action: str,
        side_yesno: str,
        quantity: int,
        limit_price_dollars: float,
        reduce_only: bool = False,
        time_in_force: str = "immediate_or_cancel",
    ) -> Dict[str, Any]:
        """Create order using Kalshi recommended V2 endpoint (quantity + price + TIF).

        Uses ``POST /trade-api/v2/portfolio/events/orders``. Returns a dict shaped like the legacy
        ``order`` object for downstream helpers (fill_count_fp, remaining_count_fp, average_fill_price*).
        """
        q = int(quantity)
        if q < 1:
            return {"error": "count must be at least 1 (whole contracts only)"}

        book_side, yes_px_raw = _v2_book_side_and_yes_price(action, side_yesno, float(limit_price_dollars))
        # Quantize to 1¢ increments (Kalshi binary tick) to avoid server "precision" rejections.
        yes_px = dollars_to_yes_no_limit_cents(yes_px_raw) / 100.0
        tif = str(time_in_force or "").strip().lower()
        if tif not in ("immediate_or_cancel", "fill_or_kill", "good_till_canceled"):
            tif = "immediate_or_cancel"

        path = "/trade-api/v2/portfolio/events/orders"
        t_raw = str(ticker or "").strip()
        t_norm = normalize_market_id(t_raw)
        tickers_to_try = [t_raw]
        if t_norm and t_norm != t_raw:
            tickers_to_try.append(t_norm)

        last_http_err: Optional[Dict[str, Any]] = None
        for t_eff in tickers_to_try:
            body: Dict[str, Any] = {
                "ticker": t_eff,
                "client_order_id": str(uuid.uuid4()),
                "side": book_side,  # bid/ask (YES leg)
                "count": _count_fp_str(q),
                "price": _fp_dollars_str(yes_px, places=4),
                "time_in_force": tif,
                "self_trade_prevention_type": "taker_at_cross",
            }
            if reduce_only:
                body["reduce_only"] = True

            log_label = f"V2 {tif} {action} {side_yesno} {t_eff} x{q} @ {body['price']} ({book_side})"
            try:
                response = await self._http_post_signed_json(path, body, timeout=15.0)
                response.raise_for_status()
                data = response.json() or {}

                filled_fp = _fp_count(data.get("fill_count"))
                avg_yes_px = _fp_dollars(data.get("average_fill_price"))
                avg_fee = _fp_dollars(data.get("average_fee_paid"))
                su = (side_yesno or "").upper()
                act_lo = str(action).lower().strip()

                held_avg_px = avg_yes_px
                if su == "NO" and 0.0 < avg_yes_px < 1.0:
                    held_avg_px = 1.0 - avg_yes_px

                fill_notional = 0.0
                if filled_fp > 0 and held_avg_px > 0:
                    fill_notional = float(held_avg_px) * float(filled_fp)
                    if act_lo == "sell":
                        fill_notional = -abs(fill_notional)

                fee_total = float(avg_fee) * float(filled_fp) if (avg_fee > 0 and filled_fp > 0) else 0.0

                out: Dict[str, Any] = {
                    "order_id": data.get("order_id"),
                    "status": "executed" if filled_fp > 0 else "open",
                    "action": act_lo,
                    "side": str(side_yesno).lower(),
                    "fill_count_fp": data.get("fill_count"),
                    "remaining_count_fp": data.get("remaining_count"),
                    # Provide cost/fee fields in the legacy shape so downstream accounting stays consistent.
                    "taker_fill_cost_dollars": fill_notional,
                    "maker_fill_cost_dollars": 0.0,
                    "taker_fees_dollars": fee_total,
                    "maker_fees_dollars": 0.0,
                }
                if "average_fill_price" in data:
                    out["average_fill_price_dollars"] = held_avg_px
                    out["average_fill_price"] = held_avg_px
                if "average_fee_paid" in data:
                    out["average_fee_paid_dollars"] = data.get("average_fee_paid")
                # Also include the order's limit in legacy fields for fallbacks / logging.
                if su == "YES":
                    out["yes_price_dollars"] = str(limit_price_dollars)
                elif su == "NO":
                    out["no_price_dollars"] = str(limit_price_dollars)
                logger.info(
                    "%s kalshi_order_id=%s fill_fp=%s remaining_fp=%s",
                    log_label,
                    out.get("order_id"),
                    out.get("fill_count_fp"),
                    out.get("remaining_count_fp"),
                )
                return out
            except httpx.HTTPStatusError as e:
                detail = ""
                try:
                    body_err = e.response.json()
                    if isinstance(body_err, dict):
                        nested = body_err.get("error")
                        if isinstance(nested, dict):
                            detail = str(
                                nested.get("details")
                                or nested.get("message")
                                or nested.get("code")
                                or ""
                            ).strip()
                        if not detail:
                            detail = (
                                str(body_err.get("message") or body_err.get("details") or body_err.get("code") or "")
                                or e.response.text
                            )
                    else:
                        detail = e.response.text
                except Exception:
                    detail = e.response.text or str(e)
                detail = (detail or str(e)).strip()
                if len(detail) > 800:
                    detail = detail[:800] + "…"
                code = int(e.response.status_code)
                last_http_err = {"error": detail, "status_code": code}
                # Only retry on "market not found" style 404s, and only when we have another ticker candidate.
                if code == 404 and len(tickers_to_try) > 1:
                    logger.warning("Create order V2 404 for ticker=%s; will retry if alternate id exists", t_eff)
                    continue
                logger.error("Create order V2 failed (%s): HTTP %s — %s", log_label, code, detail)
                return last_http_err
            except Exception as e:
                logger.error("Create order V2 failed (%s): %s", log_label, e)
                return {"error": str(e)}

        return last_http_err or {"error": "Create order failed"}

    async def _abort_resting_exit_unfilled(self, order: Dict[str, Any], log_label: str) -> Dict[str, Any]:
        """Kalshi sometimes accepts exit payloads that **rest** with zero fill; cancel to avoid stacking sells."""
        if order.get("error"):
            return order
        st = (order.get("status") or "").lower()
        if st != "resting":
            return order
        if kalshi_order_filled_contracts(order) > 0:
            return order
        oid = order.get("order_id") or order.get("id")
        if oid:
            logger.warning(
                "%s: unexpected resting exit with zero fill — cancelling order_id=%s",
                log_label,
                oid,
            )
            await self.cancel_order(str(oid))
        return {"error": f"{log_label}: exit order rested with no fill (cancelled)"}

    async def list_orders(
        self,
        *,
        status: Optional[str] = None,
        page_limit: int = 200,
        max_pages: int = 100,
    ) -> List[Dict[str, Any]]:
        """Paginated Kalshi orders (e.g. ``status=\"resting\"`` for open orders).

        Resting-only results are cached briefly (see class docstring) to avoid redundant GETs when
        both the dashboard and the bot loop poll in the same few seconds.

        ``max_pages`` caps pagination (each page is ``page_limit`` orders); use ``1`` for smoke tests.
        """
        path_base = "/trade-api/v2/portfolio/orders"
        page_limit = max(1, min(1000, page_limit))
        max_pages = max(1, min(500, int(max_pages)))
        st = (status or "").strip().lower()
        if st == "resting":
            hit = self._resting_orders_cache
            if hit is not None and time.monotonic() - hit[0] < self._RESTING_ORDERS_CACHE_TTL_SEC:
                return list(hit[1])

        accum: List[Dict[str, Any]] = []
        cursor: Optional[str] = None
        try:
            for _ in range(max_pages):
                qp: Dict[str, str] = {"limit": str(page_limit)}
                if status:
                    qp["status"] = status
                if cursor:
                    qp["cursor"] = cursor
                response = await self._http_get_signed(path_base, params=qp, timeout=20.0)
                response.raise_for_status()
                data = response.json()
                batch = data.get("orders") or []
                accum.extend(batch)
                next_cursor = (data.get("cursor") or "").strip()
                if not batch or not next_cursor:
                    break
                cursor = next_cursor
            if st == "resting":
                self._resting_orders_cache = (time.monotonic(), list(accum))
            return accum
        except Exception as e:
            logger.error("Error listing orders: %s", e)
            return []

    async def place_buy_ioc_limit(
        self,
        market_id: str,
        side: str,
        quantity: int,
        limit_price_dollars: float,
    ) -> Dict[str, Any]:
        """Aggressive **limit** buy with ``immediate_or_cancel`` (IOC).

        Fills **up to** ``quantity`` whole contracts at or better than the limit; unfilled size is
        canceled (no resting remainder). Partial fills are recorded via ``fill_count`` / helpers.

        Kalshi ``count`` is a **positive integer** (whole contracts). This bot does not request
        fractional contract counts on fractional-enabled markets.
        """
        q = int(quantity)
        if q < 1:
            return {"error": "count must be at least 1 (whole contracts only)"}
        out = await self._post_create_order_v2(
            ticker=market_id,
            action="buy",
            side_yesno=side,
            quantity=q,
            limit_price_dollars=float(limit_price_dollars),
            reduce_only=False,
            time_in_force="immediate_or_cancel",
        )
        if not out.get("error") and kalshi_order_filled_contracts(out) > 0:
            self.invalidate_market_detail_cache(market_id)
        return out

    async def sell_position(self, ticker: str, side: str, quantity: int) -> Dict[str, Any]:
        """Sell / close an existing position.

        Matches legacy ``kalshi-simple-ui-trader``: bare ``POST …/portfolio/orders`` with
        ``type: market`` only (no ``reduce_only``, no ``yes_price``/``no_price``, no
        ``client_order_id``).

        Ticker is passed through :func:`~src.reconcile.open_positions.normalize_market_id` so
        ``KXX…`` aliases align with Kalshi portfolio keys for ``reduce_only``.
        """
        q = int(quantity)
        if q < 1:
            return {"error": "sell count must be at least 1 (whole contracts only)"}
        t_eff = normalize_market_id(ticker)
        if t_eff != (ticker or "").strip():
            logger.info("Exit legacy sell ticker normalized %s -> %s", ticker, t_eff)
        payload: Dict[str, Any] = {
            "ticker": t_eff,
            "action": "sell",
            "side": side.lower(),
            "count": q,
            "type": "market",
        }
        out = await self._post_create_order(
            payload,
            f"Market sell (legacy) {side} {t_eff} x{q}",
            add_client_order_id=False,
            expected_probe_failure_status=400,
        )
        if kalshi_order_filled_contracts(out) > 0:
            self.invalidate_market_detail_cache(t_eff)
        return out

    async def place_sell_market(
        self,
        market_id: str,
        side: str,
        quantity: int,
    ) -> Dict[str, Any]:
        """Close exposure after fetching **market + orderbook** (no blind legacy/market probes).

        If **native** bids are absent on the held side, returns ``skipped_dead_book`` and places no order.
        Otherwise runs IOC reduce-only sells: orderbook best bid, native snapshot bid, parity-inferred bid,
        then optional ask-cross. See :meth:`_abort_resting_exit_unfilled` if Kalshi rests liquidity.
        """
        q = int(quantity)
        if q < 1:
            return {"error": "sell count must be at least 1 (whole contracts only)"}
        t_eff = normalize_market_id(market_id)
        raw_mid = (market_id or "").strip()

        refreshed, ob_json = await asyncio.gather(
            self.get_market(t_eff),
            self.get_market_orderbook_fp(t_eff),
        )
        if not refreshed and raw_mid and raw_mid != t_eff:
            refreshed = await self.get_market(raw_mid)
            if ob_json is None:
                ob_json = await self.get_market_orderbook_fp(normalize_market_id(raw_mid))

        if not refreshed:
            return {"error": "HTTP 404: market not found"}

        if not native_bids_available_for_exit(ob_json, refreshed, side):
            return {"skipped_dead_book": True, "status": "skipped_dead_book"}

        min_cents = 1
        price_kw = _yes_no_limit_price_field(side, min_cents)
        ob_bid_ds = best_orderbook_native_bid_dollars_string(ob_json, side)
        bid_nat = live_best_bid_dollars(refreshed, side, fallback=0.0, infer_from_opposite_ask=False)
        bid_inf = live_best_bid_dollars(refreshed, side, fallback=0.0, infer_from_opposite_ask=True)
        ask_px = live_best_ask_dollars(refreshed, side)

        follow_ups: List[Tuple[str, Dict[str, Any]]] = []
        if ob_bid_ds:
            follow_ups.append(("orderbook_bid", _yes_no_limit_price_dollars_field(side, ob_bid_ds)))
        if bid_nat and bid_nat > 0:
            cn = dollars_to_yes_no_limit_cents(bid_nat)
            if cn != min_cents:
                follow_ups.append(("native_bid", _yes_no_limit_price_field(side, cn)))
        if bid_inf and bid_inf > 0:
            follow_ups.append(
                ("inferred_bid", _yes_no_limit_price_field(side, dollars_to_yes_no_limit_cents(bid_inf)))
            )
        if ask_px and ask_px > 0:
            follow_ups.append(("ask_cross", _yes_no_limit_price_field(side, dollars_to_yes_no_limit_cents(ask_px))))

        if not follow_ups:
            follow_ups.append(("executable_floor", price_kw))

        seen_kw: Set[Tuple[str, ...]] = set()
        last: Dict[str, Any] = {}
        for label, kw in follow_ups:
            sig = _exit_price_kw_signature(kw)
            if sig in seen_kw:
                continue
            seen_kw.add(sig)
            # ``kw`` is legacy yes/no price fields; extract the held-side limit dollars and place a V2 IOC reduce-only.
            limit_leg = 0.0
            if (side or "").upper() == "YES":
                limit_leg = _fp_dollars(kw.get("yes_price_dollars"))
                if limit_leg <= 0 and kw.get("yes_price") is not None:
                    lc = _integer_cent_price_to_dollars(kw.get("yes_price"))
                    limit_leg = float(lc) if lc is not None else _fp_dollars(kw.get("yes_price"))
            else:
                limit_leg = _fp_dollars(kw.get("no_price_dollars"))
                if limit_leg <= 0 and kw.get("no_price") is not None:
                    lc = _integer_cent_price_to_dollars(kw.get("no_price"))
                    limit_leg = float(lc) if lc is not None else _fp_dollars(kw.get("no_price"))
            if limit_leg <= 0:
                limit_leg = 0.01

            last = await self._post_create_order_v2(
                ticker=t_eff,
                action="sell",
                side_yesno=side,
                quantity=q,
                limit_price_dollars=float(limit_leg),
                reduce_only=True,
                time_in_force="immediate_or_cancel",
            )
            if kalshi_order_filled_contracts(last) > 0:
                self.invalidate_market_detail_cache(t_eff)
            if kalshi_order_filled_contracts(last) > 0 or last.get("error"):
                return await self._abort_resting_exit_unfilled(
                    last,
                    f"Exit IOC sell {side} {t_eff}",
                )

        out_final = await self._abort_resting_exit_unfilled(
            last,
            f"Exit IOC sell {side} {t_eff}",
        )
        if kalshi_order_filled_contracts(out_final) > 0:
            self.invalidate_market_detail_cache(t_eff)
        return out_final

    async def place_order(
        self,
        market_id: str,
        side: str,
        quantity: int,
        limit_price: Optional[float] = None,
        order_type: str = "market",
    ) -> Dict[str, Any]:
        """Place a buy order on Kalshi (live mode).

        Default **market** buy. For ``order_type=\"limit\"`` (good-till-canceled style unless you
        pass IOC via :meth:`place_buy_ioc_limit`), supply ``limit_price`` in dollars.
        """
        payload: Dict[str, Any] = {
            "ticker": market_id,
            "action": "buy",
            "side": side.lower(),
            "count": quantity,
            "type": order_type,
            "client_order_id": str(uuid.uuid4()),
        }
        if order_type == "limit":
            if limit_price is None:
                logger.error("limit_price required for limit buy orders")
                return {"error": "limit_price required for limit orders"}
            payload.update(_yes_no_limit_price_field(side, dollars_to_yes_no_limit_cents(limit_price)))
        return await self._post_create_order(
            payload,
            f"Buy {order_type} {side} {market_id} x{quantity}",
        )

    async def cancel_order(self, order_id: str) -> bool:
        """Cancel an open order."""
        path = f"/trade-api/v2/portfolio/orders/{order_id}"
        try:
            response = await self._http_delete_signed(path, timeout=10.0)
            response.raise_for_status()
            logger.info("Order %s cancelled", order_id)
            self.invalidate_resting_orders_cache()
            return True
        except Exception as e:
            logger.error("Error cancelling order %s: %s", order_id, e)
            return False

    async def get_order(self, order_id: str) -> Dict[str, Any]:
        """Fetch a single order by id (authoritative fills / fees after IOC exits)."""
        path = f"/trade-api/v2/portfolio/orders/{order_id}"
        try:
            response = await self._http_get_signed(path, timeout=12.0)
            response.raise_for_status()
            data = response.json() if response.content else {}
            return dict(data.get("order") or data or {})
        except Exception as e:
            logger.debug("get_order %s: %s", order_id, e)
            return {}

    async def refresh_order_fill_snapshot(self, order: Dict[str, Any]) -> Dict[str, Any]:
        """Merge ``GET /portfolio/orders/{{id}}`` fill + VWAP fields into *order*.

        Create-order responses can omit or lag ``taker_fill_cost_dollars`` / ``average_fill_price*``;
        the GET shape matches Kalshi's trade history for exit economics.
        """
        if order.get("error"):
            return order
        oid = order.get("order_id") or order.get("id")
        if not oid:
            return order
        got = await self.get_order(str(oid))
        if not got or got.get("error"):
            return order
        out = dict(order)
        for k in (
            "taker_fill_cost_dollars",
            "maker_fill_cost_dollars",
            "taker_fees_dollars",
            "maker_fees_dollars",
            "fill_count_fp",
            "remaining_count_fp",
            "average_fill_price_dollars",
            "average_fill_price",
            "avg_fill_price_dollars",
            "status",
        ):
            if k not in got:
                continue
            v = got.get(k)
            if v is None or v == "":
                continue
            out[k] = v
        return out
