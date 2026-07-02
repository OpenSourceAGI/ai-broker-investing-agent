"""Close open positions from Kalshi portfolio settlement cues and ``GET /portfolio/settlements``."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from sqlalchemy.exc import OperationalError

from src.clients.kalshi_client import _fp_count, _fp_dollars
from src.database.models import Position, Trade
from src.logger import setup_logging
from src.reconcile.kalshi_positions import parse_kalshi_position_row
from src.reconcile.open_positions import (
    infer_closed_contract_quantity,
    normalize_market_id,
    open_cash_basis_dollars,
    position_market_close_time_passed,
    resolution_intrinsic_mark_dollars,
    resolution_kalshi_payout_complete_display,
    unrealized_pnl_from_executable_mark_dollars,
)
from src.util.datetimes import ensure_utc, utc_now

logger = setup_logging("kalshi_settlement")


def stamp_kalshi_resolution_from_settlement_row(
    pos: Position, settlement_row: Optional[Dict[str, Any]]
) -> None:
    """Copy Kalshi ``market_result`` when present; settlement rows imply payout processed (``finalized``)."""
    if not settlement_row:
        return
    mr = str(settlement_row.get("market_result") or "").strip().lower()
    if mr in ("yes", "no"):
        pos.kalshi_market_result = mr
        pos.kalshi_market_status = "finalized"


def _position_market_close_time_in_past(pos: Position) -> bool:
    """Aligned with dashboard / P&amp;L display horizon (expected expiration when present)."""
    return position_market_close_time_passed(pos)


def _relax_settlement_quantity_match(pos: Position) -> bool:
    """Qty fields on settlement payloads occasionally drift from our DB row — relax when stuck."""
    return bool(getattr(pos, "awaiting_settlement", False)) or _position_market_close_time_in_past(pos)


def _position_opened_at_least_hours(pos: Position, *, hours: float) -> bool:
    try:
        op = ensure_utc(pos.opened_at)
        if op is None:
            return False
        return (utc_now() - op).total_seconds() >= hours * 3600.0
    except Exception:
        return False


def settlements_latest_by_ticker(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Keep the newest settlement row per normalized ticker (ISO ``settled_time`` ordering)."""
    best: Dict[str, Tuple[str, Dict[str, Any]]] = {}
    for s in rows or []:
        raw_t = (s.get("ticker") or "").strip()
        if not raw_t:
            continue
        t = normalize_market_id(raw_t).upper()
        ts = str(s.get("settled_time") or "")
        prev = best.get(t)
        if prev is None or ts >= prev[0]:
            best[t] = (ts, s)
    return {k: v[1] for k, v in best.items()}


def position_matches_settlement_row(
    pos: Position,
    s: Dict[str, Any],
    *,
    relax_quantity: bool = False,
) -> bool:
    """True when settlement counts align with our open row's side and quantity."""
    side = (pos.side or "").upper()
    q = float(pos.quantity or 0)
    yes_cnt = _fp_count(s.get("yes_count_fp"))
    no_cnt = _fp_count(s.get("no_count_fp"))
    if relax_quantity:
        # Kalshi often lists only the winning side's ``*_count_fp``; losing NO can show ``no_count_fp``≈0
        # while ``no_total_cost_dollars`` still reflects the closed leg.
        if yes_cnt > 0.01 and no_cnt > 0.01:
            return False
        if side == "YES":
            if yes_cnt > 0.01:
                return True
            return _fp_dollars(s.get("yes_total_cost_dollars")) > 1e-9
        if side == "NO":
            if no_cnt > 0.01:
                return True
            return _fp_dollars(s.get("no_total_cost_dollars")) > 1e-9
        return False
    def _fp_tol(fp: float, local: float) -> bool:
        mx = max(abs(fp), abs(local), 1.0)
        tol = 1.01 if mx >= 1.0 else max(5e-4, 1e-7 * mx)
        return abs(fp - local) < tol

    if side == "YES":
        return _fp_tol(yes_cnt, q)
    if side == "NO":
        return _fp_tol(no_cnt, q)
    return False


def estimate_realized_pnl_from_settlement_row(pos: Position, s: Dict[str, Any]) -> Optional[float]:
    """Approximate realized PnL from a Kalshi ``Settlement`` row (binary + scalar fallback)."""
    mr = (s.get("market_result") or "").lower().strip()
    qty = max(0, int(pos.quantity or 0))
    if qty <= 0:
        qty = infer_closed_contract_quantity(pos)
    cost = open_cash_basis_dollars(
        float(pos.entry_cost or 0.0),
        float(pos.entry_price or 0.0),
        int(qty),
        float(getattr(pos, "fees_paid", 0) or 0.0),
    )
    fees = _fp_dollars(s.get("fee_cost"))
    side_u = (pos.side or "").upper()

    if mr == "void":
        return -fees

    if mr in ("yes", "no"):
        win = (side_u == "YES" and mr == "yes") or (side_u == "NO" and mr == "no")
        proceeds = float(qty) * (1.0 if win else 0.0)
        return proceeds - cost - fees

    if mr == "scalar":
        rev = float(int(s.get("revenue") or 0)) / 100.0
        return rev - cost - fees

    if s.get("revenue") is not None:
        try:
            rev = float(int(s.get("revenue") or 0)) / 100.0
            return rev - cost - fees
        except (TypeError, ValueError):
            pass

    return None


def authoritative_realized_pnl_from_settlement_row(pos: Position, s: Dict[str, Any]) -> Optional[float]:
    """Realized P&L from Kalshi settlement fields only (``revenue`` cents, side cost, ``fee_cost``).

    Skips mixed YES+NO settlement legs where ``revenue`` is not attributable to a single side.
    """
    side_u = (pos.side or "").upper()
    if side_u not in ("YES", "NO"):
        return None
    yes_cnt = float(_fp_count(s.get("yes_count_fp")))
    no_cnt = float(_fp_count(s.get("no_count_fp")))
    if yes_cnt > 0.01 and no_cnt > 0.01:
        return None
    mr = (s.get("market_result") or "").lower().strip()
    # Without ``market_result``, require a count on our side (legacy payloads).
    if mr not in ("yes", "no"):
        if side_u == "YES" and yes_cnt <= 1e-9:
            return None
        if side_u == "NO" and no_cnt <= 1e-9:
            return None
    try:
        revenue_usd = float(int(s.get("revenue") or 0)) / 100.0
    except (TypeError, ValueError):
        return None
    fee = _fp_dollars(s.get("fee_cost"))
    if side_u == "YES":
        cost_k = _fp_dollars(s.get("yes_total_cost_dollars"))
    else:
        cost_k = _fp_dollars(s.get("no_total_cost_dollars"))
    return revenue_usd - cost_k - fee


def settlement_exit_price_and_cash_usd(
    pos: Position,
    rp: float,
    *,
    settlement_row: Optional[Dict[str, Any]] = None,
) -> Tuple[float, float]:
    """Settlement cash payout and per-contract exit price for ledger/UI.

    Binary settlement payout is ``0`` or ``1`` USD per contract; **realized PnL** can still be below
    ``-(entry_cost)`` when Kalshi subtracts settlement fees, so ``entry_cost + realized`` must **not**
    be used as cash proceeds (that produced negative exit prints).
    """
    qty = max(0, int(pos.quantity or 0))
    cost_basis = float(pos.entry_cost or 0.0)
    rp_f = float(rp)
    if qty <= 0:
        return (0.0, 0.0)

    if settlement_row:
        mr = (settlement_row.get("market_result") or "").lower().strip()
        side_u = (pos.side or "").upper()
        if mr in ("yes", "no"):
            win = (side_u == "YES" and mr == "yes") or (side_u == "NO" and mr == "no")
            leg = 1.0 if win else 0.0
            cash = leg * float(qty)
            return (max(0.0, min(1.0, leg)), cash)
        if mr == "scalar" or settlement_row.get("revenue") is not None:
            try:
                rev = float(int(settlement_row.get("revenue") or 0)) / 100.0
                cash = max(0.0, rev)
                px = cash / float(qty)
                if px <= 1.0 + 1e-6:
                    px = max(0.0, min(1.0, px))
                else:
                    px = max(0.0, px)
                return (px, cash)
            except (TypeError, ValueError):
                pass

    cash = max(0.0, cost_basis + rp_f)
    px = cash / float(qty)
    if px <= 1.0 + 1e-6:
        px = max(0.0, min(1.0, px))
    else:
        px = max(0.0, px)
    return (px, cash)


async def _close_open_position_from_settlement_realized(
    db: Session,
    pos: Position,
    *,
    realized_pnl: float,
    trade_mode: str,
    broadcast_fn: Optional[Callable[[Dict[str, Any]], Awaitable[None]]],
    source: str,
    settlement_row: Optional[Dict[str, Any]] = None,
) -> None:
    qty = max(0, int(pos.quantity or 0))
    inferred = infer_closed_contract_quantity(pos)
    if qty <= 0 and inferred > 0:
        qty = int(inferred)
        pos.quantity = qty
    rp = float(realized_pnl)
    if settlement_row is not None:
        auth = authoritative_realized_pnl_from_settlement_row(pos, settlement_row)
        if auth is not None:
            rp = float(auth)
        else:
            est = estimate_realized_pnl_from_settlement_row(pos, settlement_row)
            if est is not None:
                rp = float(est)

    exit_px, cash = settlement_exit_price_and_cash_usd(pos, rp, settlement_row=settlement_row)

    extra_fees = 0.0
    if settlement_row:
        extra_fees = _fp_dollars(
            settlement_row.get("fee_cost")
            or settlement_row.get("fees_paid_dollars")
            or settlement_row.get("fees_paid")
        )
    pos.fees_paid = float(getattr(pos, "fees_paid", 0) or 0) + extra_fees

    stamp_kalshi_resolution_from_settlement_row(pos, settlement_row)

    pos.status = "closed"
    pos.closed_at = utc_now()
    pos.exit_reason = "settlement"
    pos.realized_pnl = rp
    pos.awaiting_settlement = False
    pos.dead_market = False
    pos.current_price = exit_px
    if trade_mode == "live":
        pos.kalshi_flat_reconcile_pending = False
        pos.kalshi_closure_finalized = True

    db.add(
        Trade(
            id=str(uuid.uuid4()),
            market_id=pos.market_id,
            market_title=pos.market_title,
            action="sell",
            side=pos.side,
            quantity=qty,
            price=float(exit_px),
            total_cost=float(cash),
            realized_pnl=rp,
            trade_mode=trade_mode,
        )
    )
    logger.info(
        "Position closed from Kalshi settlement (%s) %s %s x%d realized_pnl=%.2f",
        source,
        pos.market_id,
        pos.side,
        qty,
        rp,
    )
    # Commit before ``await broadcast_fn`` so we never hold a SQLite write transaction across I/O
    # (UI ``/portfolio`` snapshot inserts and the bot loop can then proceed without "database is locked").
    try:
        db.commit()
    except OperationalError:
        db.rollback()
        raise
    if broadcast_fn is not None:
        await broadcast_fn(
            {
                "type": "position_closed",
                "data": {
                    "position_id": pos.id,
                    "market_id": pos.market_id,
                    "market_title": pos.market_title,
                    "side": pos.side,
                    "exit_reason": "settlement",
                    "realized_pnl": rp,
                    "kalshi_market_result": getattr(pos, "kalshi_market_result", None),
                    "kalshi_market_status": getattr(pos, "kalshi_market_status", None),
                },
            }
        )


async def apply_kalshi_settlement_closes(
    db: Session,
    *,
    trade_mode: str,
    api_rows: List[Dict[str, Any]],
    broadcast_fn: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    kalshi_client: Any = None,
) -> int:
    """Close open ``Position`` rows that Kalshi portfolio reports as settled (qty 0 + realized PnL).

    Returns how many positions were closed.
    """
    open_keys: Set[str] = set()
    settled_realized: Dict[str, float] = {}

    for r in api_rows or []:
        snap = parse_kalshi_position_row(r)
        if snap is None:
            continue
        t = normalize_market_id(snap.ticker).upper()
        if snap.qty_raw_fp > 1e-9 and snap.side in ("YES", "NO"):
            open_keys.add(f"{t}:{snap.side}")
        elif snap.qty_raw_fp <= 1e-9 and snap.realized_pnl_usd is not None:
            settled_realized[t] = float(snap.realized_pnl_usd)

    if not settled_realized:
        return 0

    open_db = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .all()
    )
    # End the ORM transaction before any awaits so readers do not overlap writers on other connections.
    try:
        db.commit()
    except OperationalError:
        db.rollback()
        raise
    closed_n = 0
    for pos in list(open_db):
        mid = normalize_market_id(pos.market_id).upper()
        side = (pos.side or "").upper()
        if side not in ("YES", "NO"):
            continue
        if f"{mid}:{side}" in open_keys:
            continue
        if mid not in settled_realized:
            continue

        rp = float(settled_realized[mid])
        await _close_open_position_from_settlement_realized(
            db,
            pos,
            realized_pnl=rp,
            trade_mode=trade_mode,
            broadcast_fn=broadcast_fn,
            source="portfolio",
        )
        closed_n += 1

    if closed_n and kalshi_client is not None:
        kalshi_client.invalidate_settlements_cache()
    return closed_n


async def merge_settlement_rows_for_stuck_live_positions(
    db: Session,
    *,
    trade_mode: str,
    kalshi_client: Any,
    base_rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Append ticker-scoped settlement queries for open rows missing from the global settlement list."""
    if trade_mode != "live":
        return base_rows

    latest = settlements_latest_by_ticker(base_rows)
    merged = list(base_rows)
    open_db = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .all()
    )
    try:
        db.commit()
    except OperationalError:
        db.rollback()
        raise
    probe_budget = 15
    for pos in open_db:
        mid = normalize_market_id(pos.market_id).upper()
        if mid in latest:
            continue
        relaxed = _relax_settlement_quantity_match(pos)
        stale_probe = (
            not relaxed
            and probe_budget > 0
            and _position_opened_at_least_hours(pos, hours=8.0)
        )
        if not relaxed and not stale_probe:
            continue
        if stale_probe:
            probe_budget -= 1
        extra = await kalshi_client.get_settlements_for_ticker(pos.market_id)
        if not extra:
            continue
        merged.extend(extra)
        latest = settlements_latest_by_ticker(merged)
    return merged


async def apply_kalshi_settlement_history_closes(
    db: Session,
    *,
    trade_mode: str,
    settlement_rows: List[Dict[str, Any]],
    broadcast_fn: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    kalshi_client: Any = None,
) -> int:
    """Close open rows using ``GET /portfolio/settlements`` (covers archived markets / 404 books)."""
    if trade_mode != "live":
        return 0

    latest = settlements_latest_by_ticker(settlement_rows)
    if not latest:
        return 0

    open_db = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .all()
    )
    try:
        db.commit()
    except OperationalError:
        db.rollback()
        raise
    closed_n = 0
    for pos in list(open_db):
        mid = normalize_market_id(pos.market_id).upper()
        s = latest.get(mid)
        if not s:
            continue
        relax = _relax_settlement_quantity_match(pos) or _position_opened_at_least_hours(
            pos, hours=8.0
        )
        if not position_matches_settlement_row(pos, s, relax_quantity=relax):
            continue
        rp_est = estimate_realized_pnl_from_settlement_row(pos, s)
        rp_auth = authoritative_realized_pnl_from_settlement_row(pos, s)
        if rp_est is None and rp_auth is None:
            continue

        await _close_open_position_from_settlement_realized(
            db,
            pos,
            realized_pnl=float(rp_est if rp_est is not None else rp_auth or 0.0),
            trade_mode=trade_mode,
            broadcast_fn=broadcast_fn,
            source="settlements_api",
            settlement_row=s,
        )
        closed_n += 1

    if closed_n and kalshi_client is not None:
        kalshi_client.invalidate_settlements_cache()
    return closed_n


async def close_open_live_positions_when_kalshi_exchange_finalized(
    db: Session,
    *,
    trade_mode: str,
    _api_rows: List[Dict[str, Any]],
    broadcast_fn: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
    kalshi_client: Any = None,
) -> int:
    """Close open live rows when stored Kalshi market metadata shows payout-complete (``finalized`` / ``settled``).

    ``GET /markets`` (via the open-leg refresh) can run ahead of portfolio/settlement reconciliation: the UI
    then shows WON + finalized while ``status`` is still ``open``. The portfolio and settlements API closers
    can miss the same leg (omitted flat row, ticker drift, relaxed settlement mismatch). This pass closes
    using intrinsic binary P&amp;L once the stored lifecycle fields say payouts are complete.

    ``_api_rows`` is reserved for future portfolio-vs-market consistency checks (callers still pass the
    snapshot for one ``GET /portfolio/positions`` pull).

    After a settlement-style close here, :func:`import_missing_open_positions_from_kalshi` skips re-importing
    the same Kalshi leg briefly so a lagging ``GET /portfolio/positions`` row does not recreate a ghost open.
    """
    _ = _api_rows
    if trade_mode != "live":
        return 0

    open_db = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .all()
    )
    try:
        db.commit()
    except OperationalError:
        db.rollback()
        raise

    closed_n = 0
    for pos in list(open_db):
        if (pos.status or "") != "open":
            continue
        if not resolution_kalshi_payout_complete_display(pos):
            continue
        side = (pos.side or "").upper()
        if side not in ("YES", "NO"):
            continue
        intrinsic = resolution_intrinsic_mark_dollars(pos)
        if intrinsic is None:
            continue
        q = max(0, int(pos.quantity or 0))
        if q <= 0:
            inferred = infer_closed_contract_quantity(pos)
            if inferred > 0:
                q = int(inferred)
            else:
                continue
        rp = unrealized_pnl_from_executable_mark_dollars(
            mark_last=float(intrinsic),
            quantity=q,
            entry_cost=float(pos.entry_cost or 0.0),
            entry_price=float(pos.entry_price or 0.0),
            fees_paid=float(getattr(pos, "fees_paid", 0) or 0.0),
        )
        await _close_open_position_from_settlement_realized(
            db,
            pos,
            realized_pnl=float(rp),
            trade_mode=trade_mode,
            broadcast_fn=broadcast_fn,
            source="exchange_finalized",
            settlement_row=None,
        )
        closed_n += 1

    if closed_n and kalshi_client is not None:
        kalshi_client.invalidate_settlements_cache()
    return closed_n
