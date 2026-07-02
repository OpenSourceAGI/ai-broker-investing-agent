"""Finalize live **closed** positions using Kalshi-authoritative data (minimize local assumptions).

Runs after each full live reconcile (portfolio + settlements + flat-row deltas). For rows still
marked provisional (``kalshi_closure_finalized`` is false):

1. **Settlement API** — when a :class:`~src.database.models.Position` matches a ``Settlement`` row,
   overwrite ``realized_pnl`` using Kalshi ``revenue`` / ``*_total_cost_dollars`` / ``fee_cost``.
2. **Exit order refresh** — ``GET /portfolio/orders/{id}`` for the recorded sell trade id, when the
   order exists and is executed, refresh exit price / proceeds / fees / realized from the order
   object (same helpers as the IOC path).
3. **Flat reconcile complete** — if ``kalshi_flat_reconcile_pending`` is already false (delta
   applied earlier), mark the row finalized so we stop polling.
"""

from __future__ import annotations

import math
from datetime import timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from src.clients.kalshi_client import (
    kalshi_order_avg_contract_price_and_cost_for_held_side,
    kalshi_order_avg_contract_price_and_proceeds_for_held_side,
    kalshi_order_fees_dollars,
    kalshi_order_filled_contracts,
)
from src.database.models import Position, Trade
from src.logger import setup_logging
from src.reconcile.kalshi_settlement import (
    authoritative_realized_pnl_from_settlement_row,
    estimate_realized_pnl_from_settlement_row,
    position_matches_settlement_row,
    settlements_latest_by_ticker,
)
from src.reconcile.kalshi_positions import find_buy_trade_near_opened_at_for_position
from src.reconcile.open_positions import (
    closed_leg_realized_pnl_kalshi_dollars,
    infer_closed_contract_quantity,
    normalize_market_id,
)
from src.util.datetimes import ensure_utc

logger = setup_logging("kalshi_closed_position_finalize")


def _find_exit_trade_for_position(db: Session, pos: Position) -> Optional[Trade]:
    """Best-effort sell leg for this close (same market/side/mode, near ``closed_at``)."""
    ca = ensure_utc(pos.closed_at)
    if ca is None:
        return None
    mode = pos.trade_mode or "live"
    window_start = ca - timedelta(hours=48)
    window_end = ca + timedelta(hours=2)
    rows = (
        db.query(Trade)
        .filter(
            Trade.trade_mode == mode,
            Trade.action == "sell",
            Trade.market_id == pos.market_id,
            Trade.side == pos.side,
            Trade.timestamp >= window_start,
            Trade.timestamp <= window_end,
        )
        .order_by(Trade.timestamp.desc())
        .limit(5)
        .all()
    )
    return rows[0] if rows else None


def _patch_exit_trade_from_order(
    db: Session,
    pos: Position,
    *,
    order: Dict[str, Any],
    sold_whole: int,
    filled_fp: float,
    sold_px: float,
    sold_proceeds: float,
    realized: float,
) -> None:
    t = _find_exit_trade_for_position(db, pos)
    if t is None:
        return
    t.quantity = int(sold_whole)
    t.price = float(sold_px)
    t.total_cost = float(sold_proceeds)
    t.realized_pnl = float(realized)
    oid = order.get("order_id") or order.get("id") or t.id
    if oid and str(oid) != str(t.id):
        t.id = str(oid)
    db.add(t)


async def refresh_closed_live_position_economics_from_kalshi_orders(
    db: Session,
    pos: Position,
    *,
    kalshi_client: Any,
) -> bool:
    """Reload entry / exit / fees / realized from authoritative GET orders when buy+sell legs exist.

    Skips settlement closes (authoritative P&L from settlement API). Returns True if updated.
    """
    if (pos.trade_mode or "") != "live" or (pos.status or "") != "closed":
        return False
    if (pos.exit_reason or "").strip().lower() == "settlement":
        return False
    buy_t = find_buy_trade_near_opened_at_for_position(db, pos)
    sell_t = _find_exit_trade_for_position(db, pos)
    if buy_t is None or sell_t is None:
        return False
    oid_b = str(buy_t.id or "").strip()
    oid_s = str(sell_t.id or "").strip()
    if not oid_b or not oid_s:
        return False
    try:
        bo = await kalshi_client.get_order(oid_b)
        so = await kalshi_client.get_order(oid_s)
    except Exception as ex:
        logger.debug("refresh_closed_live economics get_order %s: %s", pos.market_id, ex)
        return False
    if not bo or not so:
        return False
    f_b = max(0.0, float(kalshi_order_filled_contracts(bo)))
    f_s = max(0.0, float(kalshi_order_filled_contracts(so)))
    if f_b < 1e-12 or f_s < 1e-12:
        return False
    fb_px = max(1e-6, float(pos.entry_price or 0.01))
    held = str(pos.side or "YES")
    eff_b, tot_b = kalshi_order_avg_contract_price_and_cost_for_held_side(
        bo,
        held_side=held,
        filled=f_b,
        fallback_per_contract_dollars=fb_px,
    )
    eff_s, _net_s = kalshi_order_avg_contract_price_and_proceeds_for_held_side(
        so,
        held_side=held,
        filled=f_s,
        fallback_per_contract_dollars=max(1e-6, float(eff_b)),
    )
    fees_tot = float(kalshi_order_fees_dollars(bo)) + float(kalshi_order_fees_dollars(so))
    sold_whole = max(0, int(math.floor(f_s + 1e-9)))
    if sold_whole < 1:
        return False
    qty_basis = max(int(infer_closed_contract_quantity(pos)), sold_whole)

    pos.entry_cost = float(tot_b)
    pos.entry_price = float(eff_b)
    pos.current_price = float(eff_s)
    pos.fees_paid = float(fees_tot)

    realized = closed_leg_realized_pnl_kalshi_dollars(
        quantity_sold=int(sold_whole),
        exit_price_per_contract_gross=float(eff_s),
        entry_cost_at_open=float(pos.entry_cost),
        entry_price_at_open=float(pos.entry_price),
        quantity_at_open=int(qty_basis),
        fees_paid_roundtrip=float(fees_tot),
    )
    pos.realized_pnl = float(realized)
    gross_exit = float(eff_s) * float(sold_whole)
    _patch_exit_trade_from_order(
        db,
        pos,
        order=so,
        sold_whole=sold_whole,
        filled_fp=f_s,
        sold_px=float(eff_s),
        sold_proceeds=gross_exit,
        realized=float(realized),
    )
    buy_t.price = float(eff_b)
    buy_t.total_cost = float(tot_b)
    db.add(buy_t)
    db.add(pos)
    return True


async def finalize_live_closed_positions_from_kalshi(
    db: Session,
    *,
    trade_mode: str,
    kalshi_client: Any,
    settlement_rows: List[Dict[str, Any]],
) -> int:
    """Return number of positions marked finalized (and optionally patched)."""
    if trade_mode != "live" or kalshi_client is None:
        return 0

    n = 0
    candidates = (
        db.query(Position)
        .filter(
            Position.status == "closed",
            Position.trade_mode == trade_mode,
            Position.kalshi_closure_finalized.is_(False),
        )
        .order_by(Position.closed_at.asc())
        .limit(250)
        .all()
    )

    for pos in candidates:
        finalized = False

        # IOC path can leave ``kalshi_flat_reconcile_pending`` set with no sell ``Trade`` (pure
        # settlement / expiry). Clearing it allows the no-exit-order finalize branch below to run.
        if getattr(pos, "kalshi_flat_reconcile_pending", False) and _find_exit_trade_for_position(
            db, pos
        ) is None:
            pos.kalshi_flat_reconcile_pending = False
            db.add(pos)

        mid = normalize_market_id(pos.market_id).upper()
        for s in settlement_rows or []:
            tkr = normalize_market_id((s.get("ticker") or "")).strip().upper()
            if tkr != mid:
                continue
            if not position_matches_settlement_row(pos, s, relax_quantity=True):
                continue
            auth = authoritative_realized_pnl_from_settlement_row(pos, s)
            if auth is None:
                auth = estimate_realized_pnl_from_settlement_row(pos, s)
            if auth is None:
                continue
            pos.realized_pnl = float(auth)
            pos.kalshi_flat_reconcile_pending = False
            pos.kalshi_closure_finalized = True
            ex = _find_exit_trade_for_position(db, pos)
            if ex:
                ex.realized_pnl = float(auth)
                db.add(ex)
            finalized = True
            n += 1
            logger.info(
                "Closed position finalized from Kalshi settlement row %s %s realized=%.4f",
                pos.market_id,
                pos.side,
                float(auth),
            )
            break

        if finalized:
            continue

        s_latest = settlements_latest_by_ticker(settlement_rows or []).get(mid)
        if s_latest is not None:
            est = estimate_realized_pnl_from_settlement_row(pos, s_latest)
            if est is not None:
                pos.realized_pnl = float(est)
                pos.kalshi_flat_reconcile_pending = False
                pos.kalshi_closure_finalized = True
                ex = _find_exit_trade_for_position(db, pos)
                if ex:
                    ex.realized_pnl = float(est)
                    db.add(ex)
                finalized = True
                n += 1
                logger.info(
                    "Closed position finalized from settlement estimate %s %s realized=%.4f",
                    pos.market_id,
                    pos.side,
                    float(est),
                )
                continue

        # Flat-row reconcile clears ``kalshi_flat_reconcile_pending`` before this runs; we still want a
        # GET /orders/{id} refresh when there is a recorded exit trade so IOC VWAP fixes apply.
        if not getattr(pos, "kalshi_flat_reconcile_pending", False):
            if _find_exit_trade_for_position(db, pos) is None:
                pos.kalshi_closure_finalized = True
                n += 1
                continue

        if (pos.exit_reason or "") == "settlement":
            # Matched settlement rows are finalized above. Unmatched ``settlement`` exits may still
            # have a recorded sell order — refresh from GET /orders like IOC closes instead of
            # leaving the row stuck ``kalshi_closure_finalized=false`` forever.
            if _find_exit_trade_for_position(db, pos) is None:
                pos.kalshi_closure_finalized = True
                n += 1
                continue

        ex_trade = _find_exit_trade_for_position(db, pos)
        if ex_trade is None:
            continue
        order_id = str(ex_trade.id or "").strip()
        if not order_id:
            continue
        try:
            order = await kalshi_client.get_order(order_id)
        except Exception as ex:
            logger.debug("get_order skip %s: %s", order_id, ex)
            continue
        if not order:
            continue
        filled_fp = max(0.0, float(kalshi_order_filled_contracts(order)))
        if filled_fp <= 0:
            continue
        sold_whole = max(0, int(math.floor(float(filled_fp) + 1e-9)))
        if sold_whole < 1:
            continue
        avg_exit_px, _proceeds = kalshi_order_avg_contract_price_and_proceeds_for_held_side(
            order,
            held_side=str(pos.side or "YES"),
            filled=filled_fp,
            # Never use ``pos.current_price`` here — it is often the last **mark** (ask) on an open
            # row; Kalshi GET order can omit fill costs briefly and the fallback would print ~63¢
            # when the real IOC exit was ~35¢.
            fallback_per_contract_dollars=float(pos.entry_price or 0.01),
        )
        sold_px = float(avg_exit_px)
        qty_close = max(0, int(infer_closed_contract_quantity(pos)))
        qty_for_basis = max(qty_close, sold_whole)
        fees_tot = float(getattr(pos, "fees_paid", 0) or 0.0)
        realized = closed_leg_realized_pnl_kalshi_dollars(
            quantity_sold=int(sold_whole),
            exit_price_per_contract_gross=sold_px,
            entry_cost_at_open=float(pos.entry_cost or 0.0),
            entry_price_at_open=float(pos.entry_price or 0.0),
            quantity_at_open=int(qty_for_basis),
            fees_paid_roundtrip=fees_tot,
        )

        pos.realized_pnl = float(realized)
        pos.current_price = sold_px
        pos.kalshi_flat_reconcile_pending = False
        pos.kalshi_closure_finalized = True
        gross_exit = float(sold_px) * float(sold_whole)
        _patch_exit_trade_from_order(
            db,
            pos,
            order=order,
            sold_whole=sold_whole,
            filled_fp=filled_fp,
            sold_px=sold_px,
            sold_proceeds=gross_exit,
            realized=realized,
        )
        n += 1
        logger.info(
            "Closed position finalized from Kalshi GET order %s %s order_id=%s realized=%.4f",
            pos.market_id,
            pos.side,
            order_id,
            float(realized),
        )

    return n
