"""Live Kalshi ``GET /portfolio/positions`` parsing, open-row sync, import of missing legs, flat-row closes.

See https://docs.kalshi.com/api-reference/portfolio/get-positions — fractional ``position_fp`` is floored to whole contracts.
"""

from __future__ import annotations

import asyncio
import math
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from src.clients.kalshi_client import (
    open_position_estimated_mark_dollars,
    _fp_count,
    _fp_dollars,
    kalshi_order_avg_contract_price_and_cost_for_held_side,
    kalshi_order_filled_contracts,
    open_position_mark_dollars,
)
from src.database.models import KalshiReconcileCursor, Position, Trade
from src.logger import setup_logging
from src.util.datetimes import ensure_utc, utc_now
from src.reconcile.open_positions import (
    get_open_position,
    normalize_market_id,
    normalize_side,
    unrealized_pnl_from_executable_mark_dollars,
)

_logger = setup_logging("kalshi_positions")


def recent_settlement_close_blocks_kalshi_import(
    db: Session, *, trade_mode: str, market_id: str, side: str, hours: float = 336.0
) -> bool:
    """True when we recently closed this leg as ``settlement`` — skip portfolio ghost re-import."""
    mid = normalize_market_id(market_id)
    s = normalize_side(side)
    cutoff = utc_now() - timedelta(hours=hours)
    row = (
        db.query(Position.id)
        .filter(
            Position.trade_mode == trade_mode,
            Position.status == "closed",
            Position.exit_reason == "settlement",
            Position.closed_at >= cutoff,
            func.trim(Position.market_id) == mid,
            func.upper(Position.side) == s,
        )
        .first()
    )
    return row is not None


_KALSHI_MARKET_TERMINAL_STATUSES = frozenset({"closed", "determined", "finalized", "settled"})


def pick_display_expected_expiration_iso(market: Dict[str, Any]) -> Optional[str]:
    """Kalshi UI-style event end for open positions.

    For **terminal** markets (``closed`` / ``determined`` / ``finalized`` / ``settled``), prefer
    ``occurrence_datetime`` when present so the dashboard tracks the underlying event, not only a
    distant contractual ``close_time``.

    While tradeable, prefer explicit ``expected_expiration_time``. If absent, use ``vetting_horizon_time``
    only when it is strictly **earlier** than contractual ``close_time``.
    """
    kst = str(market.get("kalshi_api_status") or "").strip().lower()
    if not kst:
        st = str(market.get("status") or "").strip().lower()
        if st in ("open", "active"):
            kst = "active"
    if kst in _KALSHI_MARKET_TERMINAL_STATUSES:
        occ = market.get("occurrence_datetime")
        occ_s = str(occ).strip() if occ is not None else ""
        if occ_s:
            return occ_s

    ee = market.get("expected_expiration_time")
    if ee is not None and str(ee).strip():
        return str(ee).strip()
    vh = market.get("vetting_horizon_time")
    ct = market.get("close_time")
    vs = str(vh).strip() if vh is not None else ""
    cs = str(ct).strip() if ct is not None else ""
    if not vs or not cs or vs == cs:
        return None
    try:
        dv = datetime.fromisoformat(vs.replace("Z", "+00:00"))
        dc = datetime.fromisoformat(cs.replace("Z", "+00:00"))
        if dv.tzinfo is None:
            dv = dv.replace(tzinfo=timezone.utc)
        if dc.tzinfo is None:
            dc = dc.replace(tzinfo=timezone.utc)
        return vs if dv < dc else None
    except Exception:
        return None


def apply_kalshi_resolution_metadata_from_market(pos: Position, market: Dict[str, Any]) -> bool:
    """Copy Kalshi ``GET /markets`` lifecycle + binary outcome onto a Position.

    ``kalshi_api_status`` follows Kalshi: ``closed`` (halted, outcome may be pending), ``determined``
    (outcome official, settlement pending), ``finalized`` / ``settled`` (terminal).
    """
    changed = False
    kst = str(market.get("kalshi_api_status") or "").strip().lower()
    rr = str(market.get("resolution_result") or "").strip().lower()
    kr_store = rr if rr in ("yes", "no") else None
    prev_st = (getattr(pos, "kalshi_market_status", None) or "").strip().lower()
    if kst != prev_st:
        pos.kalshi_market_status = kst if kst else None
        changed = True
    prev_kr = getattr(pos, "kalshi_market_result", None)
    prev_kr_n = str(prev_kr).strip().lower() if prev_kr is not None and str(prev_kr).strip() else None
    prev_kr_n = prev_kr_n if prev_kr_n in ("yes", "no") else None
    if kr_store != prev_kr_n:
        pos.kalshi_market_result = kr_store
        changed = True
    if sync_position_expiry_from_market(pos, market):
        changed = True
    return changed


def sync_position_expiry_from_market(pos: Position, market: Dict[str, Any]) -> bool:
    """Persist contractual ``close_time`` and optional display horizon from a normalized ``get_market`` row."""
    changed = False
    pick = pick_display_expected_expiration_iso(market)
    if pick is not None:
        prev = getattr(pos, "expected_expiration_time", None)
        pn = str(prev).strip() if prev else None
        if pick != pn:
            pos.expected_expiration_time = pick
            changed = True
    ct_raw = market.get("close_time")
    if ct_raw:
        cts = str(ct_raw).strip()
        if cts and (getattr(pos, "close_time", None) or "") != cts:
            pos.close_time = cts
            changed = True
    return changed


def contracts_round_half_up(qty_fp: float) -> int:
    """Round fractional *fill* toward nearest whole contract (legacy / non-Kalshi paths)."""
    if qty_fp <= 1e-9:
        return 0
    return max(0, int(Decimal(str(qty_fp)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)))


def whole_contracts_floor_from_fp(qty_fp: float) -> int:
    """Whole contracts attributed locally from Kalshi fixed-point position size (never rounds up)."""
    if qty_fp <= 1e-9:
        return 0
    return max(0, int(math.floor(float(qty_fp) + 1e-9)))


def portfolio_row_key(ticker: str, side: str) -> str:
    return f"{normalize_market_id(ticker).upper()}:{normalize_side(side)}"


@dataclass(frozen=True)
class KalshiPositionSnapshot:
    ticker: str
    side: str  # YES | NO
    qty_whole: int  # ``floor(position_fp)`` — bot-managed whole contracts
    qty_raw_fp: float  # abs raw Kalshi size; used only to detect open vs flat for settlement
    cost_usd: float  # contract notional (``market_exposure``-style), fees in ``fees_paid_dollars`` only
    avg_price: float  # dollars per contract (held side)
    fees_paid_dollars: float  # Kalshi cumulative fees on this market (API)
    realized_locked_dollars: float  # Kalshi ``realized_pnl_dollars`` (locked / settled component)
    realized_pnl_usd: Optional[float]  # when flat: same as locked; else ``None``


def parse_kalshi_position_row(r: Dict[str, Any]) -> Optional[KalshiPositionSnapshot]:
    ticker = (r.get("ticker") or r.get("market_ticker") or "").strip()
    if not ticker:
        return None

    pos_fp = float(_fp_count(r.get("position_fp") or r.get("position")))
    qty_raw_fp = abs(pos_fp)
    side = "YES" if pos_fp > 0 else ("NO" if pos_fp < 0 else "")
    qty_whole = whole_contracts_floor_from_fp(qty_raw_fp)
    # Flat rows often have ``position_fp`` exactly zero — Kalshi still returns ``realized_pnl_dollars``.
    if not side and qty_raw_fp <= 1e-9:
        yc = abs(float(_fp_count(r.get("yes_count_fp") or r.get("yes_position_fp") or 0)))
        nc = abs(float(_fp_count(r.get("no_count_fp") or r.get("no_position_fp") or 0)))
        if yc > 1e-9 and nc <= 1e-9:
            side = "YES"
        elif nc > 1e-9 and yc <= 1e-9:
            side = "NO"

    fees = _fp_dollars(r.get("fees_paid_dollars") or r.get("fees_paid"))
    realized_locked = _fp_dollars(r.get("realized_pnl_dollars") or r.get("realized_pnl"))

    # Notional only — fees stay in ``fees_paid_dollars`` so unrealized P&L can subtract both.
    exposure = _fp_dollars(r.get("market_exposure_dollars") or r.get("market_exposure"))
    if exposure <= 0:
        exposure = _fp_dollars(
            r.get("position_cost_dollars")
            or r.get("position_cost")
            or r.get("cost_basis_dollars")
            or 0.0
        )
    notional = float(exposure)
    unit = (notional / qty_raw_fp) if qty_raw_fp > 1e-12 else 0.0
    if qty_whole > 0:
        cost_basis = unit * float(qty_whole)
        avg = cost_basis / float(qty_whole) if qty_whole > 0 else 0.0
    else:
        cost_basis = float(notional)
        avg = unit

    if side not in ("YES", "NO") and qty_raw_fp > 1e-9:
        return None

    realized_pnl_usd: Optional[float] = None
    if qty_raw_fp <= 1e-9:
        realized_pnl_usd = float(realized_locked)

    return KalshiPositionSnapshot(
        ticker=ticker,
        side=side,
        qty_whole=qty_whole,
        qty_raw_fp=qty_raw_fp,
        cost_usd=float(cost_basis),
        avg_price=float(avg),
        fees_paid_dollars=float(fees),
        realized_locked_dollars=float(realized_locked),
        realized_pnl_usd=realized_pnl_usd,
    )


def snapshots_by_portfolio_key(rows: List[Dict[str, Any]]) -> Dict[str, KalshiPositionSnapshot]:
    """Index non-empty Kalshi portfolio rows by ``TICKER:SIDE``."""
    out: Dict[str, KalshiPositionSnapshot] = {}
    for r in rows or []:
        snap = parse_kalshi_position_row(r)
        if snap is None or snap.side not in ("YES", "NO"):
            continue
        if snap.qty_raw_fp <= 1e-9 and snap.cost_usd <= 1e-9 and abs(snap.realized_locked_dollars) < 1e-9 and snap.fees_paid_dollars <= 1e-9:
            continue
        out[portfolio_row_key(snap.ticker, snap.side)] = snap
    return out


def mark_position_kalshi_flat_reconcile_pending(pos: Any) -> None:
    """Flag a **live** closed row so the next flat Kalshi portfolio delta can align P&L/fees."""
    if (getattr(pos, "trade_mode", None) or "") != "live":
        return
    pos.kalshi_flat_reconcile_pending = True
    pos.kalshi_closure_finalized = False


def _cursor_get(db: Session, trade_mode: str, mid_norm: str) -> Optional[KalshiReconcileCursor]:
    return (
        db.query(KalshiReconcileCursor)
        .filter(
            KalshiReconcileCursor.trade_mode == trade_mode,
            KalshiReconcileCursor.market_id_norm == mid_norm,
        )
        .first()
    )


def _cursor_upsert(db: Session, trade_mode: str, mid_norm: str, lr: float, lf: float) -> None:
    now = utc_now()
    row = _cursor_get(db, trade_mode, mid_norm)
    if row:
        row.last_realized_dollars = float(lr)
        row.last_fees_dollars = float(lf)
        row.updated_at = now
        return
    # Savepoint: flush must see this row before a later ``_cursor_upsert`` for the same market
    # in one pass; nested + IntegrityError covers concurrent insert of the same key.
    try:
        with db.begin_nested():
            db.add(
                KalshiReconcileCursor(
                    id=str(uuid.uuid4()),
                    trade_mode=trade_mode,
                    market_id_norm=mid_norm,
                    last_realized_dollars=float(lr),
                    last_fees_dollars=float(lf),
                    updated_at=now,
                )
            )
            db.flush()
    except IntegrityError:
        row2 = _cursor_get(db, trade_mode, mid_norm)
        if row2 is None:
            raise
        row2.last_realized_dollars = float(lr)
        row2.last_fees_dollars = float(lf)
        row2.updated_at = now


def apply_kalshi_snapshot_to_open_position(pos: Any, snap: KalshiPositionSnapshot) -> bool:
    """Sync open-row fields from ``GET /portfolio/positions`` (Kalshi UI / P&L parity).

    Uses ``market_exposure_dollars`` for ``entry_cost`` / ``entry_price`` — Kalshi's official cost basis
    (for NO legs this is complement-style exposure, e.g. ~76¢ and $5.35, not per-contract NO cash ~26¢).
    Do **not** overwrite entry from ``GET /orders/{buy}`` held-side parsing; that disagrees with Kalshi
    portfolio marks and made invested $ / unrealized P&L diverge from the Kalshi app.
    """
    changed = False
    if int(pos.quantity or 0) != int(snap.qty_whole):
        pos.quantity = int(snap.qty_whole)
        changed = True
    if abs(float(pos.entry_cost or 0.0) - float(snap.cost_usd)) > 1e-6:
        pos.entry_cost = float(snap.cost_usd)
        changed = True
    if abs(float(pos.entry_price or 0.0) - float(snap.avg_price)) > 1e-8:
        pos.entry_price = float(snap.avg_price)
        changed = True
    if abs(float(getattr(pos, "fees_paid", 0) or 0) - float(snap.fees_paid_dollars)) > 1e-6:
        pos.fees_paid = float(snap.fees_paid_dollars)
        changed = True
    return changed


def find_buy_trade_near_opened_at_for_position(db: Session, pos: Position) -> Optional[Trade]:
    """Earliest buy leg matching ``opened_at`` window (same as finalize refresh)."""
    oa = ensure_utc(pos.opened_at)
    if oa is None:
        return None
    mode = pos.trade_mode or "live"
    window_start = oa - timedelta(hours=2)
    window_end = oa + timedelta(hours=48)
    rows = (
        db.query(Trade)
        .filter(
            Trade.trade_mode == mode,
            Trade.action == "buy",
            Trade.market_id == pos.market_id,
            Trade.side == pos.side,
            Trade.timestamp >= window_start,
            Trade.timestamp <= window_end,
        )
        .order_by(Trade.timestamp.asc())
        .limit(5)
        .all()
    )
    return rows[0] if rows else None


async def refresh_open_live_position_entry_from_kalshi_buy_order(
    db: Session,
    pos: Position,
    *,
    kalshi_client: Any,
) -> bool:
    """Refresh the linked buy ``Trade`` row from ``GET /orders/{{buy}}`` (ledger only).

    Open ``Position.entry_*`` stays on Kalshi ``market_exposure`` from portfolio sync so dashboard
    invested $ and unrealized P&L match the Kalshi app. Order-level held-side fill parsing can disagree
    (e.g. buy-YES-notional for a NO leg → ~26¢ vs portfolio ~76¢).
    """
    if (pos.trade_mode or "") != "live" or (pos.status or "") != "open":
        return False
    buy_t = find_buy_trade_near_opened_at_for_position(db, pos)
    if buy_t is None:
        return False
    oid = str(buy_t.id or "").strip()
    if not oid:
        return False
    try:
        bo = await kalshi_client.get_order(oid)
    except Exception as ex:
        _logger.debug("refresh_open entry get_order skip %s: %s", pos.market_id, ex)
        return False
    if not bo:
        return False
    f_b = max(0.0, float(kalshi_order_filled_contracts(bo)))
    if f_b < 1e-12:
        return False
    fb_px = max(1e-6, float(pos.entry_price or 0.01))
    eff_b, tot_b = kalshi_order_avg_contract_price_and_cost_for_held_side(
        bo,
        held_side=str(pos.side or "YES"),
        filled=f_b,
        fallback_per_contract_dollars=fb_px,
    )
    changed = False
    if abs(float(buy_t.price or 0.0) - float(eff_b)) > 1e-10:
        buy_t.price = float(eff_b)
        changed = True
    if abs(float(buy_t.total_cost or 0.0) - float(tot_b)) > 1e-6:
        buy_t.total_cost = float(tot_b)
        changed = True
    if changed:
        db.add(buy_t)
        _logger.debug(
            "Open buy trade refreshed from Kalshi GET order %s %s eff=%.6f cost=%.4f (position entry unchanged)",
            pos.market_id,
            pos.side,
            eff_b,
            tot_b,
        )
    return changed


async def recompute_open_live_position_unrealized_pnl(kalshi_client: Any, pos: Position) -> bool:
    """Refresh bid-based mark, ``bid_price``, and ``unrealized_pnl`` from ``GET /markets`` (live open rows)."""
    if (pos.trade_mode or "") != "live" or (pos.status or "") != "open":
        return False
    mid_lookup = normalize_market_id(pos.market_id)
    market = await kalshi_client.get_market(mid_lookup)
    if not market:
        raw_mid = (pos.market_id or "").strip()
        if raw_mid and raw_mid != mid_lookup:
            market = await kalshi_client.get_market(raw_mid)

    new_bid: Optional[float] = None
    est_new: Optional[float] = None
    if market:
        mp = open_position_mark_dollars(market, pos.side)
        if mp <= 0:
            t_ob = (
                (market.get("ticker") or market.get("id") or mid_lookup or "").strip()
                or mid_lookup
            )
            ob = await kalshi_client.get_market_orderbook_fp(t_ob)
            mp = open_position_mark_dollars(market, pos.side, ob)
        mark_last = float(mp)
        new_bid = mark_last
        est_opt = open_position_estimated_mark_dollars(market, pos.side)
        est_new = float(est_opt if est_opt is not None else mark_last)
    else:
        mark_last = float(pos.current_price or 0.0)

    q = max(0, int(pos.quantity or 0))
    new_unrl = unrealized_pnl_from_executable_mark_dollars(
        mark_last=float(mark_last),
        quantity=q,
        entry_cost=float(pos.entry_cost or 0.0),
        entry_price=float(pos.entry_price or 0.0),
        fees_paid=float(getattr(pos, "fees_paid", 0) or 0.0),
    )

    changed = False
    if market:
        if apply_kalshi_resolution_metadata_from_market(pos, market):
            changed = True
    if est_new is not None:
        cur_est = getattr(pos, "estimated_price", None)
        if cur_est is None or abs(float(cur_est or 0.0) - float(est_new)) > 1e-9:
            pos.estimated_price = float(est_new)
            changed = True
    cur_bid = getattr(pos, "bid_price", None)
    if new_bid is not None:
        if cur_bid is None or abs(float(cur_bid or 0.0) - float(new_bid)) > 1e-9:
            pos.bid_price = float(new_bid)
            changed = True
    if abs(float(pos.current_price or 0.0) - float(mark_last)) > 1e-9:
        pos.current_price = float(mark_last)
        changed = True
    if abs(float(pos.unrealized_pnl or 0.0) - float(new_unrl)) > 1e-6:
        pos.unrealized_pnl = float(new_unrl)
        changed = True
    return changed


async def refresh_closed_positions_resolution_from_kalshi(
    db: Session,
    *,
    trade_mode: str,
    kalshi_client: Any,
    limit: int = 100,
    only_missing_result: bool = False,
) -> Dict[str, Any]:
    """For recent closed rows, call ``GET /markets`` and persist ``kalshi_market_result`` / status when available.

    When ``only_missing_result`` is True, only rows whose stored result is not a canonical ``yes``/``no`` are fetched
    (NULL, empty, or stale text) — intended for periodic bot backfill without re-hitting settled markets.

    Returns counts plus ``updates`` (each ``{id, kalshi_market_result, kalshi_market_status}``) for WebSocket/UI merge.
    """
    lim = max(1, min(int(limit), 500))
    q = db.query(Position).filter(Position.status == "closed", Position.trade_mode == trade_mode)
    if only_missing_result:
        norm = func.coalesce(func.lower(func.trim(Position.kalshi_market_result)), "")
        q = q.filter(~norm.in_(["yes", "no"]))
    rows = q.order_by(Position.closed_at.desc().nullslast()).limit(lim).all()
    examined = len(rows)
    updated = 0
    unchanged = 0
    fetch_failed = 0
    updates: List[Dict[str, Any]] = []
    if not rows:
        return {
            "examined": 0,
            "updated": 0,
            "unchanged": 0,
            "market_fetch_failed": 0,
            "updates": [],
        }

    sem = asyncio.Semaphore(8)

    async def fetch_market_for(pos: Position) -> Tuple[Position, Optional[Dict[str, Any]]]:
        async with sem:
            mid_lookup = normalize_market_id(pos.market_id)
            market = await kalshi_client.get_market(mid_lookup)
            if not market:
                raw_mid = (pos.market_id or "").strip()
                if raw_mid and raw_mid != mid_lookup:
                    market = await kalshi_client.get_market(raw_mid)
            return (pos, market)

    parts = await asyncio.gather(*[fetch_market_for(p) for p in rows], return_exceptions=True)
    for item in parts:
        if isinstance(item, BaseException):
            fetch_failed += 1
            _logger.debug("Closed resolution get_market failed: %s", item)
            continue
        pos, market = item
        if not market:
            fetch_failed += 1
            continue
        if apply_kalshi_resolution_metadata_from_market(pos, market):
            updated += 1
            db.add(pos)
            updates.append(
                {
                    "id": pos.id,
                    "kalshi_market_result": getattr(pos, "kalshi_market_result", None),
                    "kalshi_market_status": getattr(pos, "kalshi_market_status", None),
                }
            )
        else:
            unchanged += 1
    db.commit()
    return {
        "examined": examined,
        "updated": updated,
        "unchanged": unchanged,
        "market_fetch_failed": fetch_failed,
        "updates": updates,
    }


async def refresh_open_live_positions_from_kalshi_orders(
    db: Session,
    *,
    trade_mode: str,
    kalshi_client: Any,
) -> Tuple[int, int]:
    """Apply GET-buy entry refresh + mark/unrealized recompute for all open live rows.

    Returns ``(n_entry_updates, n_unrealized_updates)`` — counts positions touched per stage.
    """
    if trade_mode != "live":
        return (0, 0)
    rows = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .order_by(Position.opened_at.asc())
        .all()
    )
    n_ent = 0
    n_un = 0
    for pos in rows:
        if await refresh_open_live_position_entry_from_kalshi_buy_order(db, pos, kalshi_client=kalshi_client):
            n_ent += 1
        if await recompute_open_live_position_unrealized_pnl(kalshi_client, pos):
            n_un += 1
    return (n_ent, n_un)


def sync_open_positions_from_kalshi_portfolio_rows(
    db: Session,
    *,
    trade_mode: str,
    api_rows: List[Dict[str, Any]],
) -> int:
    """Apply Kalshi ``GET /portfolio/positions`` to **existing** open rows (qty, cost, avg, fees).

    Skips API rows with zero whole-contract size (flat / dust) so local open rows are not zeroed
    before settlement reconciliation runs.

    For **new** rows from Kalshi-only holdings, see :func:`import_missing_open_positions_from_kalshi`.
    """
    if trade_mode != "live":
        return 0
    snaps = snapshots_by_portfolio_key(api_rows)
    if not snaps:
        return 0
    n_changed = 0
    open_rows = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .all()
    )
    for p in open_rows:
        k = portfolio_row_key(p.market_id, (p.side or ""))
        snap = snaps.get(k)
        if snap is None or snap.qty_whole < 1:
            continue
        if apply_kalshi_snapshot_to_open_position(p, snap):
            n_changed += 1
    return n_changed


async def import_missing_open_positions_from_kalshi(
    db: Session,
    *,
    trade_mode: str,
    api_rows: List[Dict[str, Any]],
    kalshi_client: Any,
) -> int:
    """Create local **open** ``Position`` rows for Kalshi holdings with no matching DB row (live only).

    Deduping: uses :func:`src.reconcile.open_positions.get_open_position` (normalized market + side)
    before insert; :func:`src.reconcile.open_positions.dedupe_open_positions` should still run afterward
    on the reconcile path to collapse any accidental duplicates.
    """
    if trade_mode != "live":
        return 0
    snaps = snapshots_by_portfolio_key(api_rows)
    if not snaps:
        return 0

    n_new = 0
    for snap in snaps.values():
        if snap.side not in ("YES", "NO") or snap.qty_whole < 1:
            continue
        mid = normalize_market_id(snap.ticker)
        if recent_settlement_close_blocks_kalshi_import(
            db, trade_mode=trade_mode, market_id=mid, side=snap.side
        ):
            continue
        if get_open_position(db, trade_mode=trade_mode, market_id=mid, side=snap.side) is not None:
            continue

        title = mid
        close_time: Optional[str] = None
        expected_expiration_time: Optional[str] = None
        et_imp: Optional[str] = None
        try:
            m = await kalshi_client.get_market(mid)
            if m:
                contract_title = (m.get("title") or "").strip() or mid
                subtitle = (m.get("subtitle") or "").strip()
                title = contract_title
                try:
                    et = (m.get("event_ticker") or "").strip()
                    if et and hasattr(kalshi_client, "get_event_title"):
                        ev_title = (await kalshi_client.get_event_title(et)) or ""
                        if ev_title:
                            tail = subtitle or contract_title
                            title = f"{ev_title} — {tail}" if tail else ev_title
                except Exception:
                    pass
                ct = m.get("close_time")
                if ct:
                    close_time = str(ct)
                ee = m.get("expected_expiration_time")
                if ee:
                    expected_expiration_time = str(ee).strip()
                _et = (m.get("event_ticker") or "").strip()
                et_imp = _et if _et else None
        except Exception as ex:
            _logger.debug("Kalshi import: market lookup %s skipped (%s)", mid, ex)

        px = float(snap.avg_price or 0.0)
        qty = int(snap.qty_whole)
        cost = float(snap.cost_usd)

        imported_this_snap = False
        for attempt in range(8):
            pos = Position(
                id=str(uuid.uuid4()),
                market_id=mid,
                market_title=title,
                event_ticker=et_imp,
                side=snap.side,
                quantity=qty,
                entry_price=px,
                entry_cost=cost,
                current_price=max(1e-6, px) if px > 0 else 0.01,
                bid_price=None,
                unrealized_pnl=0.0,
                fees_paid=float(snap.fees_paid_dollars),
                status="open",
                close_time=close_time,
                expected_expiration_time=expected_expiration_time,
                trade_mode=trade_mode,
                awaiting_settlement=False,
                dead_market=False,
            )
            try:
                with db.begin_nested():
                    db.add(pos)
                    db.flush()
                db.commit()
            except IntegrityError:
                # Concurrent ``/portfolio`` + ``/positions`` reconcile, or duplicate API key race.
                _logger.debug(
                    "Kalshi import skip (unique open leg) %s %s — row exists after concurrent insert",
                    mid,
                    snap.side,
                )
                db.rollback()
                break
            except OperationalError as e:
                db.rollback()
                orig = getattr(e, "orig", None)
                locked = isinstance(orig, sqlite3.OperationalError) and "locked" in str(orig).lower()
                if locked and attempt < 7:
                    await asyncio.sleep(0.04 * (attempt + 1))
                    continue
                if locked:
                    _logger.warning(
                        "Kalshi import skipped after sqlite locked retries %s %s; will retry next reconcile",
                        mid,
                        snap.side,
                    )
                    break
                _logger.warning("Kalshi import failed (sqlite) %s %s: %s", mid, snap.side, e)
                raise
            imported_this_snap = True
            n_new += 1
            _logger.info(
                "Imported open position from Kalshi portfolio %s %s x%d (avg=%.4f cost=%.2f)",
                mid,
                snap.side,
                qty,
                px,
                cost,
            )
            break
        if not imported_this_snap:
            continue

    return n_new


def sync_recent_closed_from_flat_portfolio_rows(
    db: Session,
    *,
    trade_mode: str,
    api_rows: List[Dict[str, Any]],
) -> int:
    """Advance Kalshi portfolio cursors and apply **deltas** to ``kalshi_flat_reconcile_pending`` closes.

    Kalshi ``realized_pnl_dollars`` / ``fees_paid_dollars`` are **cumulative per market** (ticker), not
    per closed leg. We store a :class:`~src.database.models.KalshiReconcileCursor` watermark per
    ``(trade_mode, market_id_norm)`` and, on each flat row, apply ``ΔR`` / ``ΔF`` to the newest
    pending closed row for that market (see :func:`mark_position_kalshi_flat_reconcile_pending`).
    """
    if trade_mode != "live":
        return 0

    open_rows = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .all()
    )
    open_keys = {portfolio_row_key(p.market_id, p.side) for p in open_rows}
    open_mids = {normalize_market_id(p.market_id).upper() for p in open_rows}

    n = 0
    for r in api_rows or []:
        snap = parse_kalshi_position_row(r)
        if snap is None:
            continue

        mid = normalize_market_id(snap.ticker).upper()
        R = float(snap.realized_locked_dollars)
        F = float(snap.fees_paid_dollars)
        is_open = snap.qty_whole >= 1 or snap.qty_raw_fp > 1e-9
        is_flat = snap.qty_raw_fp <= 1e-9 and snap.qty_whole < 1

        if is_open and snap.side in ("YES", "NO"):
            _cursor_upsert(db, trade_mode, mid, R, F)
            continue

        if not is_flat:
            continue

        if snap.side in ("YES", "NO"):
            if portfolio_row_key(snap.ticker, snap.side) in open_keys:
                _cursor_upsert(db, trade_mode, mid, R, F)
                continue
            side_filter: Optional[str] = snap.side.upper()
        else:
            if mid in open_mids:
                _cursor_upsert(db, trade_mode, mid, R, F)
                continue
            side_filter = None

        pend_q = (
            db.query(Position)
            .filter(
                Position.status == "closed",
                Position.trade_mode == trade_mode,
                Position.kalshi_flat_reconcile_pending == True,  # noqa: E712
            )
            .order_by(Position.closed_at.desc())
            .limit(60)
        )
        pendings_prefetch = [
            p
            for p in pend_q.all()
            if normalize_market_id(p.market_id).upper() == mid
            and (side_filter is None or (p.side or "").upper() == side_filter)
        ]

        cur = _cursor_get(db, trade_mode, mid)
        if cur is None:
            if not pendings_prefetch:
                _cursor_upsert(db, trade_mode, mid, R, F)
                continue
            # First observation for this market: attribute full Kalshi totals to the pending close
            # (bot-only accounts); otherwise prefer establishing cursor only after an open sync.
            dR, dF = R, F
            _cursor_upsert(db, trade_mode, mid, R, F)
        else:
            dR = R - float(cur.last_realized_dollars or 0.0)
            dF = F - float(cur.last_fees_dollars or 0.0)
            _cursor_upsert(db, trade_mode, mid, R, F)

        if abs(dR) < 1e-7 and abs(dF) < 1e-7:
            continue

        if not pendings_prefetch:
            continue

        newest = pendings_prefetch[0]
        if len(pendings_prefetch) > 1:
            _logger.warning(
                "kalshi_flat_reconcile_pending: %d rows for market %s — applying delta to newest closed_at only",
                len(pendings_prefetch),
                mid,
            )
            for p in pendings_prefetch[1:]:
                p.kalshi_flat_reconcile_pending = False

        newest.realized_pnl = float(newest.realized_pnl or 0.0) + dR
        newest.fees_paid = float(getattr(newest, "fees_paid", 0) or 0.0) + dF
        newest.kalshi_flat_reconcile_pending = False
        n += 1

    return n


async def sync_open_position_qty_cost_from_kalshi(
    kalshi_client: Any,
    pos: Any,
    *,
    db: Optional[Session] = None,
) -> bool:
    """Sync ``pos`` quantity, entry basis, and fees from Kalshi (same ticker + side).

    Entry uses portfolio ``market_exposure`` (Kalshi UI parity), not ``GET /orders/{{buy}}``.

    Returns ``True`` when a matching portfolio row was applied (including flat).
    """
    rows = await kalshi_client.get_positions(ticker=normalize_market_id(pos.market_id))
    want_mid = normalize_market_id(pos.market_id).upper()
    want_side = normalize_side(pos.side)
    for r in rows or []:
        rt = normalize_market_id((r.get("ticker") or r.get("market_ticker") or "").strip()).upper()
        if rt != want_mid:
            continue
        snap = parse_kalshi_position_row(r)
        if snap is None:
            continue
        if snap.side in ("YES", "NO") and snap.side != want_side:
            continue
        if snap.qty_whole < 1:
            pos.quantity = int(snap.qty_whole)
            pos.entry_cost = float(snap.cost_usd)
            pos.entry_price = float(snap.avg_price or 0.0)
            pos.fees_paid = float(snap.fees_paid_dollars)
            return True
        apply_kalshi_snapshot_to_open_position(pos, snap)
        return True
    return False
