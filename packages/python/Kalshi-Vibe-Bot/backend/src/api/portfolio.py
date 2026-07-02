"""Portfolio metrics, positions, and live Kalshi resting-order visibility.

Live mode exposes resting-order counts and an estimate of cash tied up in resting **buy** limits.
The bot scan loop applies that estimate internally when sizing risk (API ``balance`` remains Kalshi cash).
Resting orders are fetched via :meth:`KalshiClient.list_orders` (short TTL cache on the client).
"""

import asyncio
import math
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from src.api.analysis import (
    fetch_decision_logs_by_ids,
    fetch_latest_decision_logs_for_market_ids,
    serialize_decision_log_to_analysis,
)
from src.api.tuning import sync_runtime_from_db
from src.api.broadcast import broadcast_update
from src.app_state import app_state, kalshi_open_marks_refresh_lock, kalshi_ui_reconcile_lock
from src.bot.scan_eligibility import refresh_order_search_scan_ui
from src.config import settings
from src.clients.kalshi_client import (
    open_position_estimated_mark_dollars,
    open_position_mark_dollars,
    resting_buy_collateral_estimate_usd,
)
from src.database.models import (
    Position,
    PortfolioSnapshot,
    Trade,
    get_db,
    get_paper_cash_balance,
    get_vault_balance,
    ensure_vault_state,
    get_session_local,
)
from src.logger import logger
from src.util.datetimes import utc_iso_z, utc_now
from src.reconcile.kalshi_positions import (
    mark_position_kalshi_flat_reconcile_pending,
    pick_display_expected_expiration_iso,
    sync_open_position_qty_cost_from_kalshi,
)
from src.reconcile.ledger_fifo import fifo_cost_for_next_sell
from src.reconcile.open_positions import (
    closed_leg_realized_pnl_kalshi_dollars,
    closed_position_kalshi_outcome_pending,
    dedupe_open_positions,
    display_estimated_price_optional,
    infer_closed_contract_quantity,
    normalize_market_id,
    open_position_cash_basis_dollars,
    position_display_ends_contract_fallback_active,
    position_display_ends_iso,
    resolution_awaiting_payout_display,
    resolution_kalshi_payout_complete_display,
    resolution_outcome_pending_display,
    unrealized_pnl_display_optional,
    unrealized_pnl_from_executable_mark_dollars,
)

router = APIRouter(tags=["portfolio"])

# Dashboard UX: align with bundle polling + WS refresh (see ``dashboard_refresh`` broadcasts).
_UI_KALSHI_RECONCILE_MIN_INTERVAL_SEC = 6.0
_MARK_REFRESH_PARALLELISM = 8
_PORTFOLIO_TIMESERIES_SNAPSHOT_MIN_SEC = 12.0


def _serialize_open_positions(positions: List[Position]) -> List[Dict[str, Any]]:
    """Shared JSON shape for ``GET /positions`` and ``GET /positions/snapshot``.

    ``unrealized_pnl`` / ``estimated_price`` are **display** values (estimate uses Kalshi last trade when present).
    ``None`` → outcome pending / Est. dash post-close. Stored ``Position.unrealized_pnl`` stays bid-based until refresh.

    ``cash_basis`` is open **cash in** (notional + fees) — same total used for stop-loss vs Est. Value drawdown.

    ``resolution_outcome_pending`` / ``resolution_awaiting_payout`` / ``resolution_kalshi_payout_complete``
    follow Kalshi market lifecycle (``closed`` → ``determined`` → ``finalized`` / ``settled``).
    """
    return [
        {
            "id": p.id,
            "market_id": p.market_id,
            "market_title": p.market_title,
            "side": p.side,
            "quantity": p.quantity,
            "entry_price": p.entry_price,
            "entry_cost": p.entry_cost,
            "bid_price": getattr(p, "bid_price", None),
            "estimated_price": display_estimated_price_optional(p),
            "current_price": p.current_price,
            "unrealized_pnl": unrealized_pnl_display_optional(p),
            "opened_at": utc_iso_z(p.opened_at),
            "close_time": p.close_time,
            "expected_expiration_time": getattr(p, "expected_expiration_time", None),
            # Single ISO for dashboard countdown (expected event end when known, else contractual close).
            "ends_at": position_display_ends_iso(p),
            "ends_at_contract_fallback": position_display_ends_contract_fallback_active(p),
            "awaiting_settlement": bool(getattr(p, "awaiting_settlement", False)),
            "dead_market": bool(getattr(p, "dead_market", False)),
            "fees_paid": float(getattr(p, "fees_paid", 0) or 0),
            "cash_basis": open_position_cash_basis_dollars(p),
            "resolution_outcome_pending": resolution_outcome_pending_display(p),
            "resolution_awaiting_payout": resolution_awaiting_payout_display(p),
            "resolution_kalshi_payout_complete": resolution_kalshi_payout_complete_display(p),
            "kalshi_market_status": getattr(p, "kalshi_market_status", None),
            "kalshi_market_result": getattr(p, "kalshi_market_result", None),
            # Stop-loss preview (dashboard): same ``(entry − est)/entry`` rule as ``stop_loss_triggered_from_position``.
            "stop_loss_drawdown_pct_at_entry": getattr(p, "stop_loss_drawdown_pct_at_entry", None),
            "stop_loss_drawdown_effective": float(getattr(settings, "stop_loss_drawdown_pct", 0.0)),
            "exit_grace_minutes": float(getattr(settings, "exit_grace_minutes", 10.0)),
            "entry_decision_log_id": getattr(p, "entry_decision_log_id", None),
        }
        for p in positions
    ]


def attach_entry_decision_analyses(
    db: Session,
    positions: List[Position],
    serialized: List[Dict[str, Any]],
    *,
    trade_mode: Optional[str] = None,
) -> None:
    """Attach ``entry_analysis`` to each serialized row when ``Position.entry_decision_log_id`` resolves."""
    if not positions or not serialized or len(positions) != len(serialized):
        return
    want = sorted(
        {
            str(getattr(p, "entry_decision_log_id", "") or "").strip()
            for p in positions
            if getattr(p, "entry_decision_log_id", None)
        }
    )
    if not want:
        return
    by_id = fetch_decision_logs_by_ids(db, want, trade_mode=trade_mode)
    for p, row in zip(positions, serialized):
        eid = str(getattr(p, "entry_decision_log_id", "") or "").strip()
        if not eid:
            continue
        log = by_id.get(eid)
        if log is not None:
            row["entry_analysis"] = serialize_decision_log_to_analysis(log)


def load_open_positions_snapshot_payload(db: Session, trade_mode: str) -> List[Dict[str, Any]]:
    """DB-only open legs for instant UI paint: dedupe + query, **no** Kalshi HTTP."""
    dedupe_open_positions(db, trade_mode)
    db.expire_all()
    rows = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .order_by(Position.opened_at.asc(), Position.id.asc())
        .all()
    )
    serialized = _serialize_open_positions(rows)
    attach_entry_decision_analyses(db, rows, serialized, trade_mode=trade_mode)
    return serialized


async def _xai_prepaid_balance_for_portfolio() -> Optional[float]:
    """Throttled xAI prepaid fetch (~5s) aligned with dashboard ``GET /portfolio`` polling."""
    team = (settings.xai_team_id or "").strip()
    key = (settings.xai_management_api_key or "").strip()
    if team and not key and not getattr(app_state, "_xai_prepaid_management_key_hint_logged", False):
        setattr(app_state, "_xai_prepaid_management_key_hint_logged", True)
        logger.info(
            "xAI prepaid balance (dashboard): add XAI_MANAGEMENT_API_KEY from xAI Console → Settings → "
            "Management Keys. Billing uses https://management-api.x.ai; the inference XAI_API_KEY is not accepted there.",
        )
    if not team or not key:
        return None
    mono_key = "_xai_prepaid_balance_fetch_mono"
    cache_key = "_xai_prepaid_balance_usd_cache"
    now = time.monotonic()
    last = float(getattr(app_state, mono_key, 0.0) or 0.0)
    if now - last < 4.8:
        v = getattr(app_state, cache_key, None)
        return float(v) if isinstance(v, (int, float)) else None

    from src.clients.xai_client import fetch_xai_prepaid_balance_usd

    try:
        usd = await fetch_xai_prepaid_balance_usd(management_api_key=key, team_id=team)
    except Exception as e:
        logger.debug("xAI prepaid balance fetch: %s", e)
        setattr(app_state, mono_key, now)
        v = getattr(app_state, cache_key, None)
        return float(v) if isinstance(v, (int, float)) else None

    setattr(app_state, mono_key, now)
    if usd is not None:
        setattr(app_state, cache_key, float(usd))
        return float(usd)
    v = getattr(app_state, cache_key, None)
    return float(v) if isinstance(v, (int, float)) else None


async def get_xai_prepaid_balance_usd_cached() -> Optional[float]:
    """Same throttled/cache prepaid fetch as ``GET /portfolio`` (bot scan + dashboard)."""
    return await _xai_prepaid_balance_for_portfolio()


async def _kalshi_ui_portfolio_pull_if_due(db: Session) -> str:
    """At most one live Kalshi ``GET /portfolio/positions`` + DB sync per 5s, one caller at a time.

    ``GET /portfolio`` and ``GET /positions`` each used to run reconciliation on every request; when
    both mounted together they duplicated slow Kalshi + SQLite work (multi-minute dashboard stalls).
    Settlement-heavy sync remains on the bot loop and ``POST /portfolio/live/reconcile``.

    Throttle is checked **before** acquiring the lock so polls do not serialize on an idle lock when
    the min-interval gate would no-op anyway.

    Returns why this call did or did not run reconcile: ``ran`` | ``skipped_lock`` | ``skipped_throttle``
    | ``skipped_not_live`` | ``failed``.
    """
    if settings.trading_mode != "live" or app_state.kalshi_client is None:
        return "skipped_not_live"
    now = time.monotonic()
    last = float(getattr(app_state, "_kalshi_ui_reconcile_last_mono", 0.0) or 0.0)
    if now - last < float(_UI_KALSHI_RECONCILE_MIN_INTERVAL_SEC):
        logger.debug(
            "UI Kalshi portfolio reconcile skipped (throttle %.1fs since last sync)",
            now - last,
        )
        return "skipped_throttle"

    lock = kalshi_ui_reconcile_lock()
    try:
        await asyncio.wait_for(lock.acquire(), timeout=0.0)
    except asyncio.TimeoutError:
        logger.debug("UI Kalshi portfolio reconcile skipped (lock busy — another request holds it)")
        return "skipped_lock"
    try:
        await _run_live_kalshi_portfolio_reconcile(
            db,
            settlements=False,
            broadcast_fn=None,
        )
        setattr(app_state, "_kalshi_ui_reconcile_last_mono", time.monotonic())
        try:
            await broadcast_update({"type": "dashboard_refresh", "data": {"reason": "kalshi_ui_reconcile"}})
        except Exception:
            pass
        return "ran"
    except Exception as e:
        logger.warning("UI Kalshi portfolio reconcile failed: %s", e)
        return "failed"
    finally:
        lock.release()


_PREVIEW_KEYS = (
    "order_id",
    "ticker",
    "action",
    "side",
    "type",
    "remaining_count_fp",
    "yes_price_dollars",
    "no_price_dollars",
)


async def _compute_open_position_mark_mutations_row(
    kalshi_client: Any,
    s: Dict[str, Any],
    *,
    refresh_event_titles: bool,
) -> Tuple[str, Dict[str, Any]]:
    """Kalshi ``get_market`` + derived marks for one open row (parallel-friendly)."""
    pos_id = str(s["id"])
    delta: Dict[str, Any] = {}
    mid_lookup = normalize_market_id(s["market_id"])
    market: Optional[Dict[str, Any]] = await kalshi_client.get_market(mid_lookup)
    if not market:
        raw_mid = (s["market_id"] or "").strip()
        if raw_mid and raw_mid != mid_lookup:
            market = await kalshi_client.get_market(raw_mid)

    bid_price_val: Optional[float] = None
    mark_last = float(s["current_price"] or 0.0)

    if market:
        if refresh_event_titles:
            try:
                et = (market.get("event_ticker") or "").strip()
                if et and hasattr(kalshi_client, "get_event_title"):
                    ev_title = (await kalshi_client.get_event_title(et)) or ""
                    if ev_title:
                        tail = ((market.get("subtitle") or "") or (market.get("title") or "")).strip()
                        new_title = f"{ev_title} — {tail}" if tail else ev_title
                        if (new_title or "").strip() and s["market_title"] != new_title:
                            delta["market_title"] = new_title
            except Exception:
                pass

        side_u = (s["side"] or "").upper()
        mp = open_position_mark_dollars(market, side_u)
        if mp <= 0:
            t_ob = (
                (market.get("ticker") or market.get("id") or mid_lookup or "").strip()
                or mid_lookup
            )
            ob = await kalshi_client.get_market_orderbook_fp(t_ob)
            mp = open_position_mark_dollars(market, side_u, ob)
        mark_last = float(mp)
        bid_price_val = mark_last

        est_opt = open_position_estimated_mark_dollars(market, side_u)
        est_last = float(est_opt if est_opt is not None else mark_last)
        cur_est = s.get("estimated_price")
        if cur_est is None or abs(float(cur_est or 0.0) - est_last) > 1e-9:
            delta["estimated_price"] = float(est_last)

        kst = str(market.get("kalshi_api_status") or "").strip().lower()
        rr = str(market.get("resolution_result") or "").strip().lower()
        kr_store = rr if rr in ("yes", "no") else None
        prev_st = (s.get("kalshi_market_status") or "").strip().lower()
        if kst != prev_st:
            delta["kalshi_market_status"] = kst
        prev_rr = s.get("kalshi_market_result")
        prev_rr_n = None if prev_rr is None else str(prev_rr).strip().lower()
        prev_rr_n = prev_rr_n if prev_rr_n in ("yes", "no") else None
        if kr_store != prev_rr_n:
            delta["kalshi_market_result"] = kr_store

        try:
            ct = market.get("close_time")
            if ct and (s["close_time"] or "") != str(ct):
                delta["close_time"] = str(ct)
        except Exception:
            pass

        try:
            new_exp = pick_display_expected_expiration_iso(market)
            prev_exp = s.get("expected_expiration_time")
            prev_norm = str(prev_exp).strip() if prev_exp else None
            if new_exp is not None and new_exp != prev_norm:
                delta["expected_expiration_time"] = new_exp
        except Exception:
            pass

    q_snap = int(s["quantity"] or 0)
    new_unrl = unrealized_pnl_from_executable_mark_dollars(
        mark_last=float(mark_last),
        quantity=q_snap,
        entry_cost=float(s["entry_cost"] or 0.0),
        entry_price=float(s["entry_price"] or 0.0),
        fees_paid=float(s.get("fees_paid") or 0.0),
    )

    cur_bid = s.get("bid_price")
    if bid_price_val is not None:
        if cur_bid is None or abs(float(cur_bid or 0.0) - float(bid_price_val)) > 1e-9:
            delta["bid_price"] = float(bid_price_val)
    if abs(float(s["current_price"] or 0.0) - float(mark_last)) > 1e-9:
        delta["current_price"] = float(mark_last)
    if abs(float(s["unrealized_pnl"] or 0.0) - float(new_unrl)) > 1e-6:
        delta["unrealized_pnl"] = float(new_unrl)

    return pos_id, delta


def _kalshi_resting_preview(resting_orders: List[Dict[str, Any]], limit: int = 50) -> List[Dict[str, Any]]:
    """Trim Kalshi order dicts for JSON (dashboard); avoids shipping full order payloads."""
    out: List[Dict[str, Any]] = []
    for o in resting_orders[:limit]:
        out.append({k: o.get(k) for k in _PREVIEW_KEYS})
    return out


async def _refresh_open_position_marks(
    *,
    kalshi_client: Any | None,
    trade_mode: str,
    min_interval_sec: float = 2.0,
    refresh_event_titles: bool = False,
) -> None:
    """Refresh open-leg marks from Kalshi for the UI. Does not hold a DB session across ``await``.

    ``refresh_event_titles=False`` avoids N extra Kalshi calls per dashboard poll (titles still refresh on import/reconcile).
    Rows are fetched with bounded parallelism (professional dashboards batch parallel reads with a semaphore).
    """
    if kalshi_client is None:
        return

    lock = kalshi_open_marks_refresh_lock()
    try:
        await asyncio.wait_for(lock.acquire(), timeout=0.0)
    except asyncio.TimeoutError:
        return

    key = f"_last_marks_refresh_ts_{trade_mode}"
    inflight_key = f"_marks_refresh_inflight_{trade_mode}"
    snapshots: List[Dict[str, Any]] = []
    try:
        if bool(getattr(app_state, inflight_key, False)):
            return
        now = time.monotonic()
        last = float(getattr(app_state, key, 0.0) or 0.0)
        if (now - last) < float(min_interval_sec):
            return

        SessionLocal = get_session_local()
        db_read = SessionLocal()
        try:
            rows = (
                db_read.query(Position)
                .filter(Position.status == "open", Position.trade_mode == trade_mode)
                .all()
            )
            for pos in rows:
                snapshots.append(
                    {
                        "id": pos.id,
                        "market_id": pos.market_id,
                        "market_title": (pos.market_title or "").strip(),
                        "side": pos.side,
                        "quantity": int(pos.quantity or 0),
                        "entry_cost": float(pos.entry_cost or 0.0),
                        "entry_price": float(pos.entry_price or 0.0),
                        "fees_paid": float(getattr(pos, "fees_paid", 0) or 0.0),
                        "current_price": float(pos.current_price or 0.0),
                        "bid_price": getattr(pos, "bid_price", None),
                        "estimated_price": getattr(pos, "estimated_price", None),
                        "kalshi_market_status": getattr(pos, "kalshi_market_status", None),
                        "kalshi_market_result": getattr(pos, "kalshi_market_result", None),
                        "close_time": pos.close_time,
                        "expected_expiration_time": getattr(pos, "expected_expiration_time", None),
                        "unrealized_pnl": float(pos.unrealized_pnl or 0.0),
                    }
                )
        finally:
            db_read.close()

        if not snapshots:
            setattr(app_state, key, time.monotonic())
            return

        # Only flag in-flight after snapshot read succeeds (avoid wedging refresh on DB errors).
        setattr(app_state, inflight_key, True)
    finally:
        lock.release()

    try:
        mutations: Dict[str, Dict[str, Any]] = {}
        sem = asyncio.Semaphore(int(_MARK_REFRESH_PARALLELISM))

        async def _bounded_row(sn: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
            async with sem:
                return await _compute_open_position_mark_mutations_row(
                    kalshi_client,
                    sn,
                    refresh_event_titles=refresh_event_titles,
                )

        parts = await asyncio.gather(*[_bounded_row(sn) for sn in snapshots], return_exceptions=True)
        for item in parts:
            if isinstance(item, Exception):
                logger.debug("Open-position mark refresh row failed: %s", item)
                continue
            pos_id, delta = item
            if not delta:
                continue
            mutations.setdefault(pos_id, {}).update(delta)

        if not mutations:
            setattr(app_state, key, time.monotonic())
            return

        SessionLocal = get_session_local()
        db_write = SessionLocal()
        try:
            for pos_id, fields in mutations.items():
                row = db_write.query(Position).filter(Position.id == pos_id).first()
                if not row:
                    continue
                for k, v in fields.items():
                    setattr(row, k, v)
            db_write.commit()
        finally:
            db_write.close()

        setattr(app_state, key, time.monotonic())
    finally:
        setattr(app_state, inflight_key, False)


async def _sync_dashboard_open_legs(db: Session) -> str:
    """Live UI reconcile (throttled), open-leg mark refresh, dedupe — shared by portfolio, positions, bundle."""
    reconcile_outcome = "n/a"
    if settings.trading_mode == "live":
        if app_state.kalshi_client is None:
            reconcile_outcome = "no_kalshi_client"
        else:
            reconcile_outcome = await _kalshi_ui_portfolio_pull_if_due(db)
        # When the lock is busy, another request is already running the same portfolio pull + open-leg
        # pipeline. A duplicate ``quick_sync`` here caused N concurrent ``GET /portfolio`` storms and
        # SQLite contention; rely on the in-flight sync + mark refresh instead.
        if reconcile_outcome == "skipped_lock":
            logger.debug(
                "Dashboard sync: UI reconcile lock busy — skipping redundant open-leg sync "
                "(another poll holds the portfolio lock)",
            )
        db.expire_all()
    try:
        await _refresh_open_position_marks(
            kalshi_client=app_state.kalshi_client,
            trade_mode=settings.trading_mode,
            min_interval_sec=6.5 if settings.trading_mode == "live" else 3.0,
            refresh_event_titles=(settings.trading_mode != "live"),
        )
        db.expire_all()
    except Exception as e:
        logger.debug("Open-position mark refresh skipped: %s", e)
    dedupe_open_positions(db, settings.trading_mode)
    db.expire_all()
    return reconcile_outcome


async def _run_live_kalshi_portfolio_reconcile(
    db: Session,
    *,
    settlements: bool,
    broadcast_fn: Any,
) -> Tuple[int, int, int, int, int, int, int, int, int]:
    """One Kalshi ``GET /portfolio/positions`` snapshot and DB sync (live only).

    Returns the nine-tuple from :func:`~src.reconcile.kalshi_live_sync.reconcile_live_positions_from_kalshi`,
    including closure finalizations, open entry/unrealized refreshes, and exchange-finalized closes.
    """
    if settings.trading_mode != "live":
        return (0, 0, 0, 0, 0, 0, 0, 0, 0)
    kc = app_state.kalshi_client
    if kc is None:
        return (0, 0, 0, 0, 0, 0, 0, 0, 0)
    from src.reconcile.kalshi_live_sync import reconcile_live_positions_from_kalshi

    out = await reconcile_live_positions_from_kalshi(
        db,
        trade_mode=settings.trading_mode,
        kalshi_client=kc,
        settlements=settlements,
        broadcast_fn=broadcast_fn,
    )
    db.expire_all()
    return out


async def _build_portfolio_payload(db: Session) -> Dict[str, Any]:
    """Compute dashboard portfolio JSON after :func:`_sync_dashboard_open_legs` has run."""
    sync_runtime_from_db(db)

    def _num(x) -> float:
        try:
            v = float(x)
            if v != v:  # NaN
                return 0.0
            return v
        except Exception:
            return 0.0

    positions = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == settings.trading_mode)
        .all()
    )
    unrealized_pnl = sum((unrealized_pnl_display_optional(p) or 0.0) for p in positions)
    # Position market value used for dashboard tiles.
    # Paper: display mark (estimated when present). Live: overridden by Kalshi positions_value (source of truth).
    pos_value = (
        sum((display_estimated_price_optional(p) or 0.0) * _num(p.quantity) for p in positions)
        if settings.trading_mode == "paper"
        else sum(_num(p.current_price) * _num(p.quantity) for p in positions)
    )
    # Realized P&L: closed Position rows only (Kalshi-synced in live). Never sum Trade sell rows —
    # partial exit fills create multiple sell ledger lines per closed position.
    realized_pnl = float(
        db.query(func.coalesce(func.sum(Position.realized_pnl), 0.0))
        .filter(
            Position.trade_mode == settings.trading_mode,
            Position.status == "closed",
        )
        .scalar()
        or 0.0
    )

    resting_orders: List[Dict[str, Any]] = []
    resting_buy_reserve = 0.0
    portfolio_value = 0.0

    # Ensure per-mode vault row exists even before the first transfer.
    ensure_vault_state(db, trade_mode=settings.trading_mode)

    if settings.trading_mode == "paper":
        starting = _num(getattr(settings, "paper_starting_balance", 0.0))
        uninvested_cash = max(0.0, _num(get_paper_cash_balance(db, starting)))
        # Align with Performance / closed table: total mark-to-market P&L from positions.
        total_pnl = realized_pnl + unrealized_pnl
    else:
        kc = app_state.kalshi_client
        if kc is None:
            raise HTTPException(status_code=503, detail="Kalshi client not ready")
        live = await kc.get_portfolio()
        api_cash = _num(live.get("cash", 0.0))
        portfolio_value = _num(live.get("portfolio_value", api_cash))
        positions_value = _num(live.get("positions_value", max(0.0, portfolio_value - api_cash)))
        resting_orders = await kc.list_orders(status="resting")
        resting_buy_reserve = resting_buy_collateral_estimate_usd(resting_orders)
        uninvested_cash = max(0.0, api_cash - resting_buy_reserve)
        # Kalshi portfolio_value already includes live position market values using Kalshi's convention.
        # Use it for Total Balance / Total Invested so tiles reconcile with the Kalshi UI.
        pos_value = max(0.0, positions_value)
        total_pnl = realized_pnl + unrealized_pnl

    vault_balance = get_vault_balance(db, trade_mode=settings.trading_mode)
    vault_balance = min(max(0.0, vault_balance), float(uninvested_cash))
    available_cash = max(0.0, float(uninvested_cash) - float(vault_balance))

    # Time-series insert is for Performance charts — throttle writes so dashboard polls don't serialize on SQLite.
    # Total balance should include *vaulted* cash as well.
    tb, ab, inv = float(uninvested_cash) + pos_value, available_cash, pos_value
    npos = len(positions)
    now_mono_snap = time.monotonic()
    last_snap = float(getattr(app_state, "_portfolio_timeseries_last_mono", 0.0) or 0.0)
    write_timeseries = (now_mono_snap - last_snap) >= float(_PORTFOLIO_TIMESERIES_SNAPSHOT_MIN_SEC)

    if write_timeseries:
        # Snapshot insert can race Kalshi reconcile / bot loop on SQLite; retry briefly on "locked".
        # If it still fails, return metrics without 500 so the dashboard does not look "offline".
        for attempt in range(8):
            try:
                db.add(
                    PortfolioSnapshot(
                        id=str(uuid.uuid4()),
                        total_balance=tb,
                        available_balance=ab,
                        invested_amount=inv,
                        unrealized_pnl=unrealized_pnl,
                        realized_pnl=realized_pnl,
                        num_open_positions=npos,
                    )
                )
                db.commit()
                setattr(app_state, "_portfolio_timeseries_last_mono", time.monotonic())
                break
            except OperationalError as e:
                db.rollback()
                orig = getattr(e, "orig", None)
                locked = isinstance(orig, sqlite3.OperationalError) and "locked" in str(orig).lower()
                if locked and attempt < 7:
                    await asyncio.sleep(0.04 * (attempt + 1))
                    continue
                if locked:
                    logger.warning(
                        "Portfolio snapshot insert skipped after sqlite locked retries; returning payload anyway",
                    )
                    break
                logger.error("Portfolio error: %s", e)
                raise HTTPException(status_code=500, detail=str(e))

    # Total balance should represent *all* uninvested cash (cash + vault) + invested mark.
    # Transfers between Available Cash and Vault must not affect this number.
    total_value_out = (
        portfolio_value if settings.trading_mode == "live" else (float(uninvested_cash) + pos_value)
    )

    xai_prepaid: Optional[float] = None
    try:
        xai_prepaid = await _xai_prepaid_balance_for_portfolio()
    except Exception as e:
        logger.debug("xAI prepaid balance (portfolio): %s", e)

    scan_active, scan_label = refresh_order_search_scan_ui(
        db,
        settings,
        available_cash,
        total_portfolio_value_usd=float(total_value_out),
        xai_prepaid_balance_usd=xai_prepaid,
        open_position_count=npos,
        ai_provider=getattr(settings, "default_ai_provider", "gemini"),
    )

    payload: Dict[str, Any] = {
        "balance": available_cash,
        "uninvested_cash": uninvested_cash,
        "vault_balance": vault_balance,
        "positions": len(positions),
        "invested_amount": pos_value,
        "realized_pnl": realized_pnl,
        "total_pnl": total_pnl,
        "unrealized_pnl": unrealized_pnl,
        "total_value": total_value_out,
        "timestamp": utc_iso_z(utc_now()),
        "xai_prepaid_balance_usd": round(xai_prepaid, 2) if xai_prepaid is not None else None,
        "order_search_active": bool(scan_active),
        "order_search_label": str(scan_label),
        "ai_provider": str(getattr(settings, "default_ai_provider", "gemini")),
        "stop_loss_selling_enabled": bool(getattr(settings, "stop_loss_selling_enabled", False)),
    }
    if settings.trading_mode == "live":
        payload["kalshi_resting_order_count"] = len(resting_orders)
        payload["resting_buy_collateral_estimate_usd"] = round(resting_buy_reserve, 4)
        payload["kalshi_resting_orders_preview"] = _kalshi_resting_preview(resting_orders)
    return payload


@router.get("/portfolio")
async def get_portfolio(db: Session = Depends(get_db)):
    try:
        await _sync_dashboard_open_legs(db)
        return await _build_portfolio_payload(db)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Portfolio error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard/bundle")
async def get_dashboard_bundle(db: Session = Depends(get_db)):
    """Single round-trip for dashboard: one reconcile + mark pass, then portfolio tiles + open positions."""
    try:
        reconcile_outcome = await _sync_dashboard_open_legs(db)
        portfolio_payload = await _build_portfolio_payload(db)
        position_rows = (
            db.query(Position)
            .filter(Position.status == "open", Position.trade_mode == settings.trading_mode)
            .order_by(Position.opened_at.asc(), Position.id.asc())
            .all()
        )
        latest_by_mid = fetch_latest_decision_logs_for_market_ids(
            db, [p.market_id for p in position_rows], trade_mode=settings.trading_mode
        )
        position_analyses = {
            mid: serialize_decision_log_to_analysis(log) for mid, log in latest_by_mid.items()
        }
        serialized_positions = _serialize_open_positions(position_rows)
        attach_entry_decision_analyses(db, position_rows, serialized_positions, trade_mode=settings.trading_mode)
        return {
            "portfolio": portfolio_payload,
            "positions": serialized_positions,
            "reconcile_outcome": reconcile_outcome,
            "position_analyses": position_analyses,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Dashboard bundle error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/vault/transfer")
async def vault_transfer(payload: Dict[str, Any], db: Session = Depends(get_db)):
    """Move funds between Available Cash and Vault (internal reserve).

    ``amount`` must be a positive integer-like USD amount (e.g., 1/10/100). Transfers are clamped:
    - to_vault: cannot exceed available cash
    - to_cash: cannot exceed vault balance
    """
    direction = str(payload.get("direction") or "").strip().lower()
    try:
        amt = float(payload.get("amount") or 0.0)
    except Exception:
        amt = 0.0
    amt = float(int(round(amt)))
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    if direction not in ("to_vault", "to_cash"):
        raise HTTPException(status_code=400, detail="Invalid direction")

    row = ensure_vault_state(db, trade_mode=settings.trading_mode)

    # Compute current uninvested cash (same notion as GET /portfolio before vault is applied).
    if settings.trading_mode == "paper":
        starting = float(getattr(settings, "paper_starting_balance", 0.0) or 0.0)
        uninvested_cash = max(0.0, float(get_paper_cash_balance(db, starting)))
    else:
        kc = app_state.kalshi_client
        if kc is None:
            raise HTTPException(status_code=503, detail="Kalshi client not ready")
        live = await kc.get_portfolio()
        api_cash = float(live.get("cash", 0.0) or 0.0)
        resting_orders = await kc.list_orders(status="resting")
        resting_buy_reserve = resting_buy_collateral_estimate_usd(resting_orders)
        uninvested_cash = max(0.0, api_cash - float(resting_buy_reserve))

    vault_balance = max(0.0, float(row.vault_balance or 0.0))
    vault_balance = min(vault_balance, float(uninvested_cash))
    available_cash = max(0.0, float(uninvested_cash) - vault_balance)

    if direction == "to_vault":
        if available_cash + 1e-9 < amt:
            raise HTTPException(status_code=400, detail="Insufficient available cash")
        vault_balance = min(float(uninvested_cash), vault_balance + amt)
    else:
        if vault_balance + 1e-9 < amt:
            raise HTTPException(status_code=400, detail="Insufficient vault balance")
        vault_balance = max(0.0, vault_balance - amt)

    row.vault_balance = float(vault_balance)
    row.updated_at = utc_now()
    db.add(row)
    db.commit()

    await broadcast_update({"type": "dashboard_refresh", "data": {}})

    return {
        "balance": max(0.0, float(uninvested_cash) - float(vault_balance)),
        "uninvested_cash": float(uninvested_cash),
        "vault_balance": float(vault_balance),
    }


@router.post("/portfolio/live/cancel-resting-orders")
async def cancel_kalshi_resting_orders():
    """Cancel every **resting** order on Kalshi (live). Use to free collateral from stale limits."""
    if settings.trading_mode != "live":
        raise HTTPException(status_code=400, detail="Only available in live trading mode")
    kc = app_state.kalshi_client
    if kc is None:
        raise HTTPException(status_code=503, detail="Kalshi client not ready")
    kc.invalidate_resting_orders_cache()
    resting = await kc.list_orders(status="resting")
    cancelled: List[str] = []
    failed: List[str] = []
    for o in resting:
        oid = o.get("order_id")
        if not oid:
            continue
        if await kc.cancel_order(str(oid)):
            cancelled.append(str(oid))
        else:
            failed.append(str(oid))
    await broadcast_update({
        "type": "kalshi_resting_orders_cancelled",
        "data": {"cancelled": len(cancelled), "failed": len(failed)},
    })
    return {"cancelled_count": len(cancelled), "cancelled_order_ids": cancelled, "failed_order_ids": failed}


@router.post("/portfolio/live/reconcile")
async def reconcile_kalshi_portfolio_now(db: Session = Depends(get_db)):
    """Run a full Kalshi portfolio reconciliation immediately (same pipeline as periodic sync).

    Pulls ``GET /portfolio/positions`` once, updates existing open rows (qty, cost, fees), imports any
    Kalshi-only open holdings as new ``Position`` rows (deduped by market + side), refreshes open
    entry economics from buy orders and recomputes unrealized P&L, then runs settlement closes and
    applies flat-row deltas to pending closed positions.
    """
    if settings.trading_mode != "live":
        raise HTTPException(status_code=400, detail="Only available in live trading mode")
    if app_state.kalshi_client is None:
        raise HTTPException(status_code=503, detail="Kalshi client not ready")
    try:
        (
            n_open,
            n_imp,
            n_port,
            n_hist,
            n_flat,
            n_fin,
            n_open_entry_orders,
            n_open_unrealized,
            n_exchange_finalized,
        ) = await _run_live_kalshi_portfolio_reconcile(
            db,
            settlements=True,
            broadcast_fn=broadcast_update,
        )
        try:
            await broadcast_update({"type": "dashboard_refresh", "data": {"reason": "manual_reconcile"}})
        except Exception:
            pass
        return {
            "success": True,
            "open_updates": n_open,
            "open_positions_imported": n_imp,
            "settlement_portfolio_closes": n_port,
            "settlement_history_closes": n_hist,
            "flat_row_reconciliations": n_flat,
            "closure_finalizations": n_fin,
            "open_entry_order_refreshes": n_open_entry_orders,
            "open_unrealized_refreshes": n_open_unrealized,
            "exchange_finalized_closes": n_exchange_finalized,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Kalshi reconcile error: %s", e)
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/positions")
async def get_positions(db: Session = Depends(get_db)):
    try:
        reconcile_outcome = await _sync_dashboard_open_legs(db)

        positions = (
            db.query(Position)
            .filter(Position.status == "open", Position.trade_mode == settings.trading_mode)
            .order_by(Position.opened_at.asc(), Position.id.asc())
            .all()
        )
        logger.debug(
            "GET /positions: returning %d open row(s) (trade_mode=%s ui_reconcile=%s)",
            len(positions),
            settings.trading_mode,
            reconcile_outcome,
        )
        serialized = _serialize_open_positions(positions)
        attach_entry_decision_analyses(db, positions, serialized, trade_mode=settings.trading_mode)
        return serialized
    except Exception as e:
        logger.error("Positions error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/positions/snapshot")
async def get_positions_snapshot(db: Session = Depends(get_db)):
    """Instant dashboard paint from SQLite only — no Kalshi marks refresh or portfolio reconcile.

    The UI should call ``GET /positions`` afterward for authoritative marks, unrealized P&amp;L,
    and live imports (same generation / merge logic as the full poll).
    """
    try:
        out = load_open_positions_snapshot_payload(db, settings.trading_mode)
        logger.info(
            "GET /positions/snapshot: returning %d open row(s) (trade_mode=%s)",
            len(out),
            settings.trading_mode,
        )
        return out
    except Exception as e:
        logger.error("Positions snapshot error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/positions/closed")
async def get_closed_positions(limit: int = 50, db: Session = Depends(get_db)):
    try:
        # Live mode: we intentionally do **not** bulk-sync ``Position.realized_pnl`` from
        # ``GET /portfolio/positions`` here. That API returns at most **one** row per ticker
        # (often aggregate or last-settlement realized on a flat position). Mapping
        # ``ticker -> realized`` and applying it to **every** historical closed row for that
        # market corrupts P&L when the bot re-enters the same ticker multiple times — each
        # close row keeps values finalized by reconcile (settlements API, exit order refresh,
        # flat-row deltas, ``kalshi_closure_finalized``).

        rows = (
            db.query(Position)
            .filter(Position.status == "closed", Position.trade_mode == settings.trading_mode)
            .order_by(Position.closed_at.desc())
            .limit(limit)
            .all()
        )
        out: List[Dict[str, Any]] = []
        for p in rows:
            q_disp = infer_closed_contract_quantity(p)
            raw_mr = getattr(p, "kalshi_market_result", None)
            kalshi_result: Optional[str] = None
            if isinstance(raw_mr, str):
                mr = raw_mr.strip().lower()
                if mr in ("yes", "no"):
                    kalshi_result = mr
            out.append(
                {
                    "id": p.id,
                    "market_id": p.market_id,
                    "market_title": p.market_title,
                    "side": p.side,
                    "quantity": q_disp,
                    "entry_price": p.entry_price,
                    "entry_cost": float(p.entry_cost or 0.0),
                    "exit_price": p.current_price,
                    "realized_pnl": p.realized_pnl,
                    "opened_at": utc_iso_z(p.opened_at),
                    "closed_at": utc_iso_z(p.closed_at),
                    "exit_reason": p.exit_reason,
                    "fees_paid": float(getattr(p, "fees_paid", 0) or 0),
                    "kalshi_market_result": kalshi_result,
                    "kalshi_market_status": getattr(p, "kalshi_market_status", None),
                    "kalshi_outcome_pending": closed_position_kalshi_outcome_pending(p),
                    "entry_decision_log_id": getattr(p, "entry_decision_log_id", None),
                }
            )
        attach_entry_decision_analyses(db, rows, out, trade_mode=settings.trading_mode)
        latest_by_mid = fetch_latest_decision_logs_for_market_ids(
            db, [p.market_id for p in rows], trade_mode=settings.trading_mode
        )
        position_analyses = {
            mid: serialize_decision_log_to_analysis(log) for mid, log in latest_by_mid.items()
        }
        return {"positions": out, "position_analyses": position_analyses}
    except Exception as e:
        logger.error("Closed positions error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/positions/closed/refresh-resolution")
async def refresh_closed_positions_resolution(
    limit: int = 50,
    trade_mode: Optional[str] = None,
    only_missing_result: bool = False,
    db: Session = Depends(get_db),
):
    """Backfill ``kalshi_market_result`` / status on recent closed rows via Kalshi ``GET /markets``."""
    kc = app_state.kalshi_client
    if kc is None:
        raise HTTPException(status_code=503, detail="Kalshi client not ready")
    lim = max(1, min(int(limit), 500))
    mode = (trade_mode or settings.trading_mode or "paper").strip().lower()
    if mode not in ("paper", "live"):
        mode = "paper"
    try:
        from src.reconcile.kalshi_positions import refresh_closed_positions_resolution_from_kalshi

        out = await refresh_closed_positions_resolution_from_kalshi(
            db,
            trade_mode=mode,
            kalshi_client=kc,
            limit=lim,
            only_missing_result=bool(only_missing_result),
        )
    except Exception as e:
        logger.error("Closed resolution refresh error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    updates = list(out.get("updates") or [])
    if updates:
        await broadcast_update({"type": "closed_positions_resolution", "data": {"updates": updates}})
    return out


@router.post("/history/reset")
async def reset_history(db: Session = Depends(get_db)):
    """Wipe closed-position history for the current trade_mode.

    - Deletes only ``Position`` rows with ``status == 'closed'`` (open positions are untouched).
    - Restores strategy knob defaults from configuration (``apply_config_defaults_to_tuning_state``).
    - Broadcasts a dashboard refresh so pages repaint.
    """
    try:
        from src.api.tuning import apply_config_defaults_to_tuning_state

        mode = settings.trading_mode
        deleted = (
            db.query(Position)
            .filter(Position.status == "closed", Position.trade_mode == mode)
            .delete(synchronize_session=False)
        )
        db.commit()

        tuning_payload = apply_config_defaults_to_tuning_state(db)

        await broadcast_update({"type": "dashboard_refresh", "data": {}})
        await broadcast_update({"type": "tuning_update", "data": tuning_payload})

        return {
            "success": True,
            "trade_mode": mode,
            "closed_positions_deleted": int(deleted or 0),
            "tuning": tuning_payload,
        }
    except Exception as e:
        logger.error("Reset history error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/positions/{position_id}/close")
async def close_position_manual(position_id: str, db: Session = Depends(get_db)):
    kc = app_state.kalshi_client
    if kc is None:
        raise HTTPException(status_code=503, detail="Kalshi client not ready")

    pos = db.query(Position).filter(
        Position.id == position_id,
        Position.status == "open",
        Position.trade_mode == settings.trading_mode,
    ).first()
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    fifo_basis = 0.0
    fifo_ok = False
    try:
        exit_order_id = None

        if settings.trading_mode == "live":
            from src.clients.kalshi_client import (
                is_order_error_market_unavailable,
                kalshi_order_avg_contract_price_and_proceeds,
                kalshi_order_fees_dollars,
                kalshi_order_filled_contracts,
            )

            sell_result = await kc.place_sell_market(
                pos.market_id,
                pos.side,
                pos.quantity,
            )
            floor_d = float(pos.current_price or 0.01)
            if sell_result.get("skipped_dead_book"):
                pos.dead_market = True
                pos.awaiting_settlement = True
                db.commit()
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Dead market: no native bids on the order book for this contract side. "
                        "The position is flagged on the dashboard; exits retry automatically when bids return."
                    ),
                )
            if sell_result.get("error"):
                if is_order_error_market_unavailable(sell_result["error"]):
                    pos.awaiting_settlement = True
                    pos.dead_market = False
                    db.commit()
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Market no longer accepts orders on Kalshi (404). "
                            "Position marked awaiting settlement; the bot will close it when "
                            "portfolio/settlement data catches up."
                        ),
                    )
                raise HTTPException(status_code=502, detail=sell_result["error"])
            filled_fp = max(0.0, float(kalshi_order_filled_contracts(sell_result)))
            if filled_fp <= 0:
                pos.dead_market = True
                pos.awaiting_settlement = True
                db.commit()
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Exit IOC did not fill; position left open — illiquid or halted? "
                        "Marked dead market until native bids return."
                    ),
                )
            sell_result = await kc.refresh_order_fill_snapshot(sell_result)
            filled_fp = max(0.0, float(kalshi_order_filled_contracts(sell_result)))
            from src.clients.kalshi_client import kalshi_order_avg_contract_price_and_proceeds_for_held_side

            avg_exit_px, _proceeds = kalshi_order_avg_contract_price_and_proceeds_for_held_side(
                sell_result,
                held_side=str(pos.side or "YES"),
                filled=filled_fp,
                fallback_per_contract_dollars=float(floor_d),
            )
            exit_order_id = (
                sell_result.get("order_id")
                or sell_result.get("client_order_id")
                or sell_result.get("id")
            )
            sold_whole = max(0, int(math.floor(float(filled_fp) + 1e-9)))
            if sold_whole < 1:
                raise HTTPException(
                    status_code=400,
                    detail="Exit fill contained no whole contracts; close any Kalshi residual manually.",
                )
            sold_qty_trade = sold_whole
            scale = sold_whole / float(filled_fp) if filled_fp > 1e-9 else 1.0
            sold_px = float(avg_exit_px)
            exit_fees_scaled = float(kalshi_order_fees_dollars(sell_result)) * scale
            pos.fees_paid = float(getattr(pos, "fees_paid", 0) or 0) + exit_fees_scaled
            gross_exit_notional = float(sold_px) * float(sold_qty_trade)
            current_value = gross_exit_notional
            pre_qty = max(0, int(pos.quantity or 0))
            pre_entry_cost = float(pos.entry_cost or 0.0)
            pre_entry_price = float(pos.entry_price or 0.0)
            pre_sync_fees_paid = float(getattr(pos, "fees_paid", 0) or 0.0)
            per_contract_basis = float(pos.entry_cost or 0.0) / float(pre_qty) if pre_qty > 0 else 0.0
            sold_basis = per_contract_basis * float(sold_qty_trade)
            fill_integer = sold_qty_trade > 0 and abs(float(filled_fp) - round(float(filled_fp))) < 1e-6
            fifo_basis, fifo_ok = (0.0, False)
            if fill_integer and sold_qty_trade < pre_qty:
                fifo_basis, fifo_ok = fifo_cost_for_next_sell(
                    db,
                    trade_mode=settings.trading_mode,
                    market_id=pos.market_id,
                    side=pos.side,
                    sell_qty=int(sold_qty_trade),
                )
            realized = closed_leg_realized_pnl_kalshi_dollars(
                quantity_sold=int(sold_qty_trade),
                exit_price_per_contract_gross=sold_px,
                entry_cost_at_open=pre_entry_cost,
                entry_price_at_open=pre_entry_price,
                quantity_at_open=pre_qty,
                fees_paid_roundtrip=pre_sync_fees_paid,
            )
            pos.awaiting_settlement = False
            pos.dead_market = False

            synced = await sync_open_position_qty_cost_from_kalshi(kc, pos, db=db)
            if synced:
                if int(pos.quantity or 0) <= 0:
                    pos.quantity = int(sold_qty_trade)
                    if pre_entry_price > 1e-12:
                        pos.entry_price = pre_entry_price
                    if pre_entry_cost > 1e-12:
                        pos.entry_cost = pre_entry_cost
                    pos.fees_paid = pre_sync_fees_paid
                    pos.status = "closed"
                    pos.closed_at = utc_now()
                    pos.exit_reason = "manual"
                    pos.realized_pnl = realized
                    pos.current_price = sold_px
                    mark_position_kalshi_flat_reconcile_pending(pos)
            else:
                remaining = max(0, int(pre_qty) - int(sold_qty_trade))
                if remaining <= 0:
                    pos.status = "closed"
                    pos.closed_at = utc_now()
                    pos.exit_reason = "manual"
                    pos.realized_pnl = realized
                    pos.current_price = sold_px
                    mark_position_kalshi_flat_reconcile_pending(pos)
                else:
                    pos.quantity = remaining
                    basis_removed = fifo_basis if fifo_ok else sold_basis
                    pos.entry_cost = max(0.0, float(pos.entry_cost or 0.0) - basis_removed)
                    pos.entry_price = (
                        (pos.entry_cost / pos.quantity) if int(pos.quantity or 0) > 0 else pos.entry_price
                    )
        else:
            sold_qty_trade = int(pos.quantity or 0)
            current_value = float(pos.current_price or 0.0) * sold_qty_trade
            sold_px = float(pos.current_price or 0.0)
            realized = current_value - float(pos.entry_cost or 0.0)
            pos.status = "closed"
            pos.closed_at = utc_now()
            pos.exit_reason = "manual"
            pos.realized_pnl = realized

        exit_trade = Trade(
            id=str(exit_order_id or uuid.uuid4()),
            market_id=pos.market_id,
            market_title=pos.market_title,
            action="sell",
            side=pos.side,
            quantity=sold_qty_trade,
            price=sold_px,
            total_cost=current_value,
            realized_pnl=realized,
            trade_mode=settings.trading_mode,
        )
        db.add(exit_trade)
        db.commit()

        await broadcast_update({
            "type": "position_closed",
            "data": {"market_id": pos.market_id, "exit_reason": "manual", "realized_pnl": realized},
        })
        return {"success": True, "realized_pnl": realized}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Close position error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
