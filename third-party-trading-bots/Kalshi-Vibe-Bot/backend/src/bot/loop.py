"""Market scan, analysis, execution, and position monitoring (live: IOC entries, Kalshi-aligned exits)."""

import asyncio
import json
import math
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Coroutine, Dict, List, Optional, Set, Tuple

from src.clients.kalshi_client import (
    buy_side_liquidity_skip_summary,
    executable_buy_best_ask_dollars,
    live_best_bid_dollars,
    open_position_estimated_mark_dollars,
    open_position_mark_dollars,
)
from src.analysis_payload import enrich_analysis_ai_provider
from src.app_state import kalshi_ui_reconcile_lock
from src.config import (
    DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT,
    DEFAULT_MIN_EDGE_TO_BUY_PCT,
)
from src.logger import setup_logging
from src.util.datetimes import ensure_utc, utc_iso_z, utc_now
from src.reconcile.ledger_fifo import fifo_cost_for_next_sell
from src.reconcile.kalshi_positions import (
    mark_position_kalshi_flat_reconcile_pending,
    pick_display_expected_expiration_iso,
    sync_open_position_qty_cost_from_kalshi,
    sync_position_expiry_from_market,
)
from src.reconcile.open_positions import (
    closed_leg_realized_pnl_kalshi_dollars,
    normalize_market_id,
    open_position_cash_basis_dollars,
    resolution_intrinsic_mark_dollars,
    stop_loss_triggered_from_position,
)
from src.decision_engine.market_resolution_context import enrich_ai_market_description
from src.decision_engine.strategy_gates import (
    autonomous_buy_gate_failure,
    effective_min_edge_for_market,
    effective_scan_min_volume,
    exit_grace_minutes_for_market,
    kelly_contract_cap_for_bankroll,
)
from src.decision_engine.strategy_math import (
    ai_win_prob_pct_on_buy_side,
    edge_pct_for_side,
    effective_buy_gate_thresholds,
    kelly_contracts_for_order,
    kelly_order_skip_summary,
)
from src.bot.event_batch_partition import (
    LINE_LADDER_MAX_LEGS_FOR_XAI,
    group_markets_by_event_batch_partition,
    shortlist_line_ladder_members_for_xai,
)

logger = setup_logging("bot.loop")

# Throttle Kalshi ``GET /markets`` backfill for closed rows missing ``kalshi_market_result``.
_CLOSED_RESOLUTION_REFRESH_LAST_MONO = 0.0


async def _maybe_auto_refresh_closed_resolution(
    kalshi_client,
    db_factory,
    broadcast_fn: Callable[[dict], Coroutine],
    settings,
) -> None:
    """Poll Kalshi for outcomes on recent closes that still lack ``yes``/``no`` (stop-loss friendly)."""
    global _CLOSED_RESOLUTION_REFRESH_LAST_MONO
    iv = int(getattr(settings, "closed_resolution_refresh_interval_sec", 0) or 0)
    if iv <= 0 or kalshi_client is None:
        return
    now = time.monotonic()
    if now - _CLOSED_RESOLUTION_REFRESH_LAST_MONO < float(iv):
        return

    # Avoid overlapping UI ``GET /portfolio`` reconcile (same lock): parallel closed-resolution
    # ``get_market`` bursts were tying up Kalshi + SQLite alongside dashboard polls.
    try:
        ui_busy = kalshi_ui_reconcile_lock().locked()
    except AttributeError:
        ui_busy = False
    if ui_busy:
        logger.debug("Closed resolution auto-refresh deferred (UI portfolio reconcile lock held)")
        return

    batch = int(getattr(settings, "closed_resolution_refresh_batch", 25) or 25)
    mode = (settings.trading_mode or "paper").strip().lower()
    if mode not in ("paper", "live"):
        mode = "paper"

    db = db_factory()
    try:
        from src.reconcile.kalshi_positions import refresh_closed_positions_resolution_from_kalshi

        out = await refresh_closed_positions_resolution_from_kalshi(
            db,
            trade_mode=mode,
            kalshi_client=kalshi_client,
            limit=batch,
            only_missing_result=True,
        )
        if int(out.get("updated", 0) or 0) > 0:
            logger.info(
                "Closed resolution auto-refresh: examined=%s updated=%s fetch_failed=%s",
                out.get("examined"),
                out.get("updated"),
                out.get("market_fetch_failed"),
            )
            updates = list(out.get("updates") or [])
            if updates:
                await broadcast_fn({"type": "closed_positions_resolution", "data": {"updates": updates}})
    except Exception as e:
        logger.warning("Closed resolution auto-refresh skipped: %s", e)
    finally:
        db.close()
        _CLOSED_RESOLUTION_REFRESH_LAST_MONO = time.monotonic()


# ── Market pre-filter ──────────────────────────────────────────────────────────

_CONTAINER_PATTERNS = ("KXMVE", "CROSSCATEGORY", "MULTIGAME")

# Scan: skip LLM escalation when Kalshi YES/NO snapshot mids are both extreme (token waste vs min AI win % gates).
# ``yes_price`` / ``no_price`` are dollars 0–1 on the normalized market dict.
_EXTREME_SNAPSHOT_HI = 0.90  # strictly above → >90¢ on that outcome
_EXTREME_SNAPSHOT_LO = 0.10  # strictly below → <10¢ on that outcome


def _extreme_binary_snapshot_skew_rejects(yes_p: float, no_p: float) -> bool:
    """YES-favorite (YES>90¢ and NO<10¢) or NO-favorite (NO>90¢ and YES<10¢) when both snapshots exist."""
    if yes_p > _EXTREME_SNAPSHOT_HI and no_p > 0.0 and no_p < _EXTREME_SNAPSHOT_LO:
        return True
    if no_p > _EXTREME_SNAPSHOT_HI and yes_p > 0.0 and yes_p < _EXTREME_SNAPSHOT_LO:
        return True
    return False


def _max_leg_volume_scan_unit(members: List[dict]) -> float:
    """Priority score for a scan unit: max ``volume`` across member markets."""
    best = 0.0
    for m in members:
        try:
            best = max(best, float(m.get("volume") or 0.0))
        except (TypeError, ValueError):
            continue
    return best


def _cap_scan_queue_units_by_volume(
    scan_queue: List[Tuple[str, Optional[str], List[dict]]],
    cap: int,
) -> List[Tuple[str, Optional[str], List[dict]]]:
    """When ``cap`` > 0 and queue is longer, keep the top ``cap`` units by :func:`_max_leg_volume_scan_unit`."""
    if cap <= 0 or len(scan_queue) <= cap:
        return scan_queue
    ranked = sorted(scan_queue, key=lambda u: _max_leg_volume_scan_unit(u[2]), reverse=True)
    return ranked[:cap]


def _tradeable_scan_queue(tradeable: List[dict]) -> List[Tuple[str, Optional[str], List[dict]]]:
    """Queue scan units: single market, or a **partition** of an event (true siblings only).

    Kalshi ``event_ticker`` can hold unrelated props (e.g. different pitchers' K lines). Those are
    split into separate batch groups via :func:`group_markets_by_event_batch_partition`.
    """
    by_et: Dict[str, List[dict]] = {}
    for m in tradeable:
        et = (m.get("event_ticker") or "").strip().upper()
        if not et:
            continue
        by_et.setdefault(et, []).append(m)

    handled_et: Set[str] = set()
    out: List[Tuple[str, Optional[str], List[dict]]] = []
    for m in tradeable:
        et = (m.get("event_ticker") or "").strip().upper()
        if not et:
            out.append(("single", None, [m]))
            continue
        if et in handled_et:
            continue
        handled_et.add(et)
        grp = list(by_et.get(et) or [])
        grp.sort(key=lambda x: normalize_market_id(str(x.get("id") or "")))
        parts = group_markets_by_event_batch_partition(grp)
        for pkey in sorted(parts.keys()):
            sub = list(parts[pkey])
            sub.sort(key=lambda x: normalize_market_id(str(x.get("id") or "")))
            if len(sub) > 1:
                out.append(("batch", et, sub))
            else:
                out.append(("single", et, sub))
    return out


def _cooldown_market_ids_from_event_batch_xai_jsons(
    xai_analysis_texts: List[Optional[str]],
) -> Tuple[Set[str], Set[str]]:
    """Parse batch ``xai_analysis`` blobs into cooldown targets.

    Returns ``(explicit_market_ids, legacy_event_tickers)``. New rows list
    ``event_batch_market_ids`` (only those legs are debounced). Older rows only had
    ``event_ticker`` — caller expands that to **all** tradeable ids under the event.
    """
    explicit: Set[str] = set()
    legacy_events: Set[str] = set()
    for xa_text in xai_analysis_texts:
        if not xa_text:
            continue
        try:
            xa = json.loads(xa_text)
        except Exception:
            continue
        if not xa.get("event_batch"):
            continue
        raw_ids = xa.get("event_batch_market_ids")
        if isinstance(raw_ids, list) and len(raw_ids) > 0:
            for lid in raw_ids:
                nk = normalize_market_id(str(lid or "")).strip().upper()
                if nk:
                    explicit.add(nk)
        else:
            et = str(xa.get("event_ticker") or "").strip().upper()
            if et:
                legacy_events.add(et)
    return explicit, legacy_events


def _event_tickers_from_event_batch_xai_json(xai_analysis_texts: List[Optional[str]]) -> Set[str]:
    """Backward-compat: event tickers from batch rows that lack ``event_batch_market_ids``."""
    _e, legacy = _cooldown_market_ids_from_event_batch_xai_jsons(xai_analysis_texts)
    return legacy


def _tradeable_market_ids_for_event_tickers(
    tradeable: List[dict], event_tickers: Set[str]
) -> Set[str]:
    """All normalized market ids in ``tradeable`` whose ``event_ticker`` is in the set."""
    out: Set[str] = set()
    if not event_tickers:
        return out
    for m in tradeable:
        et = (m.get("event_ticker") or "").strip().upper()
        if not et or et not in event_tickers:
            continue
        tid = str(m.get("id") or "")
        if tid:
            out.add(normalize_market_id(tid).upper())
    return out


def _apply_event_series_locks(
    tradeable: List[dict],
    *,
    locked_event_tickers: Set[str],
    allowed_market_id_by_event: Dict[str, str],
) -> List[dict]:
    """Filter tradeable markets so locked event series only allow the chosen market id.

    This prevents contradictory sibling strikes (and therefore contradictory YES/NO exposures) within a single event series.
    """
    if not locked_event_tickers:
        return tradeable
    out: List[dict] = []
    for m in tradeable:
        et = (m.get("event_ticker") or "").strip().upper()
        if not et or et not in locked_event_tickers:
            out.append(m)
            continue
        allow = allowed_market_id_by_event.get(et)
        if not allow:
            continue
        mid = normalize_market_id(str(m.get("id") or "")).upper()
        if mid and mid == allow:
            out.append(m)
    return out


def _event_series_lock_blocks_market(
    market_id: object,
    event_ticker: object,
    *,
    locked_event_tickers: Set[str],
    allowed_market_id_by_event: Dict[str, str],
) -> bool:
    """True if a series lock applies and this market id is not the allowed sibling."""
    et = str(event_ticker or "").strip().upper()
    if not et or et not in locked_event_tickers:
        return False
    allow = str(allowed_market_id_by_event.get(et) or "").strip().upper()
    mid = normalize_market_id(str(market_id or "")).upper()
    return not (bool(allow) and mid == allow)


def _vetting_anchor_datetime(val: object, *, now: datetime) -> Optional[datetime]:
    """Parse occurrence / expected_expiration for stale checks; ignore garbage extremes."""
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt = dt.astimezone(timezone.utc)
    except Exception:
        return None
    if dt.year < 2020 or dt > now + timedelta(days=3650):
        return None
    return dt


def _buy_leg_passes_liquidity(
    bid: float,
    ask: float,
    spread: float,
    ask_size: float,
    max_spread: float,
    min_top_size: float,
) -> bool:
    """Same gates as scan_and_trade uses before BUY_YES / BUY_NO execution."""
    if bid <= 0.0 and ask > 0.0 and ask < 0.95:
        return False
    if bid > 0.0 and ask > 0.0 and spread > max_spread:
        return False
    if ask > 0.0 and ask_size < min_top_size:
        return False
    return True


def _buy_horizon_deltas_seconds(market: dict, *, now: datetime) -> List[float]:
    """Seconds-until each distinct anchor among ``vetting_horizon_time`` and contractual ``close_time``.

    May include non-positive values when an anchor is in the past (caller treats as expired).
    Used only when ``expected_expiration_time`` is missing or already past — see
    ``_seconds_until_buy_horizon``.
    """
    seen: Set[str] = set()
    out: List[float] = []
    for key in ("vetting_horizon_time", "close_time"):
        raw = market.get(key)
        if not raw:
            continue
        iso = str(raw).strip()
        if not iso or iso in seen:
            continue
        seen.add(iso)
        try:
            ct = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            if ct.tzinfo is None:
                ct = ct.replace(tzinfo=timezone.utc)
            ct = ct.astimezone(timezone.utc)
            sec = (ct - now).total_seconds()
            if math.isfinite(sec):
                out.append(float(sec))
        except Exception:
            continue
    return out


def _seconds_until_buy_horizon(market: dict, *, now: datetime) -> Tuple[Optional[float], str]:
    """Wall time until the market's **event end** for ``BOT_MAX_HOURS`` vetting.

    Prefer Kalshi ``expected_expiration_time`` when present and still in the future so
    contractual ``close_time`` (often days after the game for sports props) does not block
    buys pegged to the actual event. When expected expiration is missing or already past,
    fall back to the earliest positive delta among ``vetting_horizon_time`` and ``close_time``.
    """
    exp_dt = _vetting_anchor_datetime(market.get("expected_expiration_time"), now=now)
    if exp_dt is not None and exp_dt > now:
        return float((exp_dt - now).total_seconds()), ""

    deltas_sec = _buy_horizon_deltas_seconds(market, now=now)
    if not deltas_sec:
        return None, "no_event_horizon"
    positive = [d for d in deltas_sec if d > 0.0]
    if not positive:
        return None, "already_expired"
    return min(positive), ""


def is_tradeable_market(
    market: dict,
    max_hours: int = 6,
    min_volume: float = 1.0,
    max_spread: float = 0.15,
    min_top_size: float = 1.0,
    min_residual_payoff: float = 0.0,
) -> Tuple[bool, str]:
    """Return (pass, reason_if_failed).

    Volume uses Kalshi's volume_24h_fp (24h contract count).

    Time window ``max_hours``: prefer ``expected_expiration_time`` when parseable and still in
    the future (event expected to end within the window). If it is absent or already past, use
    the soonest future instant among ``vetting_horizon_time`` and contractual ``close_time``.

    Liquidity: at least one contract leg (YES or NO) must pass the same spread / depth
    checks used at execution time, so BUY_NO opportunities are not filtered out solely
    because the YES book is thin.

    When ``min_residual_payoff`` > 0 (``LOCAL_MIN_RESIDUAL_PAYOFF``), at least one leg must
    also clear the same **gross upside** floor as execution: ``(1 − native ask) ≥ floor`` on
    that leg. This drops skewed books where only the expensive outcome is liquid (the model would
    almost always hit the post-analysis residual skip).

    Hardcoded **extreme snapshot** skip: ``yes_price``/``no_price`` in the dust/favorite regime
    (YES>90¢ and NO<10¢, or NO>90¢ and YES<10¢) to avoid LLM spend the downstream gates would reject.
    """
    ticker = market.get("id", "").upper()
    if any(pat in ticker for pat in _CONTAINER_PATTERNS):
        return False, "mve_container"
    if market.get("market_type") != "binary":
        return False, "not_binary"
    if market.get("status") not in ("open", "active"):
        return False, f"not_open({market.get('status')})"
    if (market.get("volume") or 0) < min_volume:
        return False, f"low_volume({market.get('volume', 0):.1f})"
    yes_price = float(market.get("yes_price") or 0.0)
    if yes_price == 0.0:
        return False, "no_price_data"
    no_price = float(market.get("no_price") or 0.0)
    if _extreme_binary_snapshot_skew_rejects(yes_price, no_price):
        return False, "extreme_binary_snapshot_skew"

    # ── Liquidity / spread: YES leg OR NO leg (matches execution paths) ─────
    yes_bid = float(market.get("yes_bid") or 0.0)
    yes_ask = float(market.get("yes_ask") or 0.0)
    yes_spread = float(market.get("yes_spread") or 1.0)
    yes_ask_size = float(market.get("yes_ask_size") or 0.0)

    no_bid = float(market.get("no_bid") or 0.0)
    no_ask = float(market.get("no_ask") or 0.0)
    no_spread = float(market.get("no_spread") or 1.0)
    no_ask_size = float(market.get("no_ask_size") or 0.0)

    yes_ok = _buy_leg_passes_liquidity(
        yes_bid, yes_ask, yes_spread, yes_ask_size, max_spread, min_top_size,
    )
    no_ok = _buy_leg_passes_liquidity(
        no_bid, no_ask, no_spread, no_ask_size, max_spread, min_top_size,
    )
    if not yes_ok and not no_ok:
        return False, "illiquid_yes_and_no"

    mr = float(min_residual_payoff or 0.0)
    if mr > 1e-12:
        res_yes = (1.0 - yes_ask) if yes_ask > 0.0 else 0.0
        res_no = (1.0 - no_ask) if no_ask > 0.0 else 0.0
        viable_yes = yes_ok and res_yes + 1e-12 >= mr
        viable_no = no_ok and res_no + 1e-12 >= mr
        if not viable_yes and not viable_no:
            return False, f"no_buy_meets_residual_floor({mr:.2f})"

    now = datetime.now(timezone.utc)
    sec_until, fail = _seconds_until_buy_horizon(market, now=now)
    if sec_until is None:
        return False, fail
    hours_out = float(sec_until) / 3600.0
    if hours_out > float(max_hours):
        return False, "too_far_out"
    return True, ""


# ── Bot state helper ───────────────────────────────────────────────────────────

def get_bot_state_str(db_factory) -> str:
    from src.database.models import BotState
    db = db_factory()
    try:
        row = db.query(BotState).filter(BotState.id == 1).first()
        return row.state if row else "stop"
    finally:
        db.close()


def is_bot_playing(db_factory) -> bool:
    """True only when dashboard mode is ``play`` (market scan + AI analysis + new trades)."""
    return get_bot_state_str(db_factory) == "play"


def _position_age_minutes_utc(opened_at: Optional[datetime]) -> float:
    """Minutes since ``opened_at`` (UTC)."""
    if opened_at is None:
        return float("inf")
    op = ensure_utc(opened_at)
    if op is None:
        return float("inf")
    return max(0.0, (utc_now() - op).total_seconds() / 60.0)


# ── Position monitor ───────────────────────────────────────────────────────────

async def monitor_positions(
    kalshi_client,
    db_factory,
    broadcast_fn,
    settings,
    allow_exits: bool = True,
    *,
    bot_state_label: str = "",
):
    """Refresh open positions; optionally exit those hitting an exit condition.

    ``allow_exits`` is False only when ``bot_state`` is ``stop`` (no auto sells); ``bot_state_label``
    is logged when a would-be exit is suppressed so logs match the DB/UI.
    """
    from src.database.models import Position, Trade
    from src.reconcile.open_positions import dedupe_open_positions

    db = db_factory()

    try:
        positions = db.query(Position).filter(
            Position.status == "open",
            Position.trade_mode == settings.trading_mode,
        ).all()
        if not positions:
            logger.debug(
                "monitor_positions: no open rows for trade_mode=%s (skipping Kalshi reconcile)",
                settings.trading_mode,
            )
            return

        # Live: Kalshi ``GET /portfolio/positions`` → DB (qty, cost, avg, fees) + settlement + flat-row patches.
        live_reconcile_ran_ok = False
        if settings.trading_mode == "live":
            try:
                from src.reconcile.kalshi_live_sync import reconcile_live_positions_from_kalshi

                _n_open, n_imp, n_port, n_hist, n_flat, n_fin, _n_ent, _n_un, n_exfin = (
                    await reconcile_live_positions_from_kalshi(
                        db,
                        trade_mode=settings.trading_mode,
                        kalshi_client=kalshi_client,
                        settlements=True,
                        broadcast_fn=broadcast_fn,
                    )
                )
                live_reconcile_ran_ok = True
                if n_imp:
                    logger.info("Kalshi portfolio import created %d new open position row(s)", n_imp)
                if n_port:
                    logger.info("Kalshi settlement sync closed %d position(s)", n_port)
                if n_hist:
                    logger.info(
                        "Kalshi settlements API closed %d position(s) (archived/404 markets)",
                        n_hist,
                    )
                if n_exfin:
                    logger.info(
                        "Kalshi exchange-finalized metadata closed %d open position(s)",
                        n_exfin,
                    )
                if n_flat:
                    logger.info("Kalshi flat portfolio rows patched %d closed position(s)", n_flat)
                if n_fin:
                    logger.info("Kalshi closed-position finalizations (API) applied: %d", n_fin)
                if _n_ent or _n_un:
                    logger.info(
                        "Kalshi open live refined from GET orders / marks: entry_updates=%d unrealized_updates=%d",
                        _n_ent,
                        _n_un,
                    )
            except Exception as e:
                logger.warning("Live positions sync skipped: %s", e)

        dedupe_open_positions(db, settings.trading_mode)
        positions = db.query(Position).filter(
            Position.status == "open",
            Position.trade_mode == settings.trading_mode,
        ).all()
        if not positions:
            return

        for pos in positions:
            # ``reconcile_live_positions_from_kalshi`` already called ``get_market`` per open row via
            # ``recompute_open_live_position_unrealized_pnl``. Skip duplicate fetches when safe so each scan
            # does not pay 2× Kalshi market latency (still fetch when we need the live book).
            market: Optional[Dict[str, Any]] = None
            mark_last = float(pos.current_price or 0.0)

            trust_reconcile_marks = settings.trading_mode == "live" and live_reconcile_ran_ok
            need_market_fetch = (settings.trading_mode != "live") or (not trust_reconcile_marks)
            if trust_reconcile_marks:
                if bool(getattr(pos, "awaiting_settlement", False)) or bool(
                    getattr(pos, "dead_market", False)
                ):
                    need_market_fetch = True

            if need_market_fetch:
                mid_lookup = normalize_market_id(pos.market_id)
                market = await kalshi_client.get_market(mid_lookup)
                if not market:
                    raw_mid = (pos.market_id or "").strip()
                    if raw_mid and raw_mid != mid_lookup:
                        market = await kalshi_client.get_market(raw_mid)

                if market:
                    mp = open_position_mark_dollars(market, pos.side)
                    if mp <= 0:
                        t_ob = (
                            (market.get("ticker") or market.get("id") or mid_lookup or "")
                            .strip()
                            or mid_lookup
                        )
                        ob = await kalshi_client.get_market_orderbook_fp(t_ob)
                        mp = open_position_mark_dollars(market, pos.side, ob)
                    mark_last = float(mp)
                    est_opt = open_position_estimated_mark_dollars(market, pos.side)
                    pos.estimated_price = float(est_opt if est_opt is not None else mark_last)
                    kst = str(market.get("kalshi_api_status") or "").strip().lower()
                    rr = str(market.get("resolution_result") or "").strip().lower()
                    pos.kalshi_market_status = kst if kst else None
                    pos.kalshi_market_result = rr if rr in ("yes", "no") else None

                    # Refresh display title to match Kalshi UI (event title often contains city).
                    try:
                        et = (market.get("event_ticker") or "").strip()
                        if et:
                            ev_title = (await kalshi_client.get_event_title(et)) or ""
                            if ev_title:
                                tail = ((market.get("subtitle") or "") or (market.get("title") or "")).strip()
                                new_title = f"{ev_title} — {tail}" if tail else ev_title
                                if (new_title or "").strip() and (pos.market_title or "").strip() != new_title:
                                    pos.market_title = new_title
                    except Exception:
                        pass
                    try:
                        sync_position_expiry_from_market(pos, market)
                    except Exception:
                        pass
                else:
                    mark_last = float(pos.current_price or 0.0)
                    logger.debug(
                        "No market book for %s — using stored mark %.4f (expiration/settlement path)",
                        pos.market_id,
                        mark_last,
                    )
            marks_from_reconcile_only = trust_reconcile_marks and not need_market_fetch
            book_ok_for_exits = market is not None or marks_from_reconcile_only

            current_price = float(mark_last)
            current_value = mark_last * pos.quantity
            cash_basis = open_position_cash_basis_dollars(pos)

            intrinsic_resolved_mark = resolution_intrinsic_mark_dollars(pos)

            pos.bid_price = float(mark_last)
            pos.current_price = float(mark_last)
            pos.unrealized_pnl = current_value - cash_basis

            # Align flag clears with **strict liquidation mark** (``mark_last`` / ``open_position_mark_*``)
            # or an official resolved intrinsic (winning YES legs often have **no bids** while ``finalized``).
            # ``live_best_bid_dollars`` may still read ``yes_price`` composite and wrongly clear dead-market
            # state while the dashboard bid column shows 0¢.
            if settings.trading_mode == "live" and (
                mark_last > 0 or intrinsic_resolved_mark is not None
            ):
                had_flag = bool(getattr(pos, "awaiting_settlement", False)) or bool(
                    getattr(pos, "dead_market", False)
                )
                if bool(getattr(pos, "awaiting_settlement", False)):
                    pos.awaiting_settlement = False
                if bool(getattr(pos, "dead_market", False)):
                    pos.dead_market = False
                if had_flag:
                    logger.info(
                        "Cleared settlement/dead-market flags %s — mark=%.4f intrinsic=%s",
                        pos.market_id,
                        mark_last,
                        "set" if intrinsic_resolved_mark is not None else "none",
                    )

            exit_reason: Optional[str] = None
            grace_min = exit_grace_minutes_for_market(
                float(getattr(settings, "exit_grace_minutes", 10.0)),
                str(getattr(pos, "market_title", "") or ""),
                str(getattr(pos, "event_ticker", "") or ""),
            )
            past_grace = _position_age_minutes_utc(pos.opened_at) >= grace_min

            # Stop-loss: **entry price** vs display **Est. Value** per contract (fees excluded).
            # Uses **current** ``STOP_LOSS_DRAWDOWN_PCT`` from Settings / tuning.
            sl_pct = float(getattr(settings, "stop_loss_drawdown_pct", 0.0))
            stop_sales_on = bool(getattr(settings, "stop_loss_selling_enabled", False))
            if stop_sales_on and not exit_reason and past_grace:
                if stop_loss_triggered_from_position(pos, stop_loss_drawdown_pct=sl_pct):
                    exit_reason = "stop_loss"

            if not exit_reason:
                continue

            if settings.trading_mode == "live" and bool(getattr(pos, "awaiting_settlement", False)):
                logger.debug(
                    "Suppress auto-exit %s (%s) — awaiting Kalshi settlement (dead book or market removed)",
                    pos.market_id,
                    exit_reason,
                )
                continue

            logger.info(
                "Exiting %s (%s x%d) — reason=%s  P&L=%.2f",
                pos.market_id, pos.side, pos.quantity, exit_reason,
                current_value - cash_basis,
            )

            if not allow_exits:
                logger.info(
                    "Auto-exits disabled (bot_state=%s); would exit %s reason=%s",
                    bot_state_label or "?",
                    pos.market_id,
                    exit_reason,
                )
                continue

            if settings.trading_mode == "live":
                from src.clients.kalshi_client import (
                    is_order_error_market_unavailable,
                    kalshi_order_avg_contract_price_and_proceeds_for_held_side,
                    kalshi_order_fees_dollars,
                    kalshi_order_filled_contracts,
                )

                sell_n = max(0, int(pos.quantity or 0))
                if sell_n < 1:
                    logger.warning("Skip live exit %s — zero whole-contract quantity in DB", pos.market_id)
                    continue
                sell_result = await kalshi_client.place_sell_market(
                    pos.market_id,
                    pos.side,
                    sell_n,
                )
                floor_d = float(current_price or 0.01)
                if sell_result.get("skipped_dead_book"):
                    pos.dead_market = True
                    pos.awaiting_settlement = True
                    logger.info(
                        "Live exit deferred %s — no native bids on book (dead market); will retry when bids return",
                        pos.market_id,
                    )
                    db.commit()
                    continue
                err = sell_result.get("error")
                if err:
                    if is_order_error_market_unavailable(err):
                        pos.awaiting_settlement = True
                        pos.dead_market = False
                        logger.warning(
                            "Live exit skipped — market not tradable on Kalshi (%s); "
                            "marked awaiting_settlement for reconciliation: %s",
                            pos.market_id,
                            err,
                        )
                        db.commit()
                    else:
                        logger.error(
                            "Live exit failed %s: %s",
                            pos.market_id,
                            err,
                        )
                    continue
                if kalshi_order_filled_contracts(sell_result) <= 0:
                    # Native bid only — parity-inferred bids can show liquidity IOC cannot hit.
                    exe_bid = (
                        live_best_bid_dollars(
                            market, pos.side, fallback=0.0, infer_from_opposite_ask=False
                        )
                        if market is not None
                        else 0.0
                    )
                    bid_txt = f"{exe_bid:.2f}" if exe_bid and exe_bid > 0 else "none"
                    logger.warning(
                        "Live exit did not fill — leaving position open %s kalshi_status=%s "
                        "executable_bid=%s (IOC/market needs contra bids; empty book = expected cancel)",
                        pos.market_id,
                        sell_result.get("status"),
                        bid_txt,
                    )
                    if not sell_result.get("error") and (exe_bid is None or exe_bid <= 0):
                        pos.awaiting_settlement = True
                        pos.dead_market = True
                        logger.info(
                            "Marked awaiting_settlement %s — no bids; stop IOC retries until "
                            "settlement sync or liquidity returns",
                            pos.market_id,
                        )
                        db.commit()
                    continue
                sell_result = await kalshi_client.refresh_order_fill_snapshot(sell_result)
                filled_fp = max(0.0, float(kalshi_order_filled_contracts(sell_result)))
                # Exit IOC can partially fill; only the filled size is realized/closed.
                if filled_fp <= 0:
                    logger.warning(
                        "Live exit IOC returned nonpositive filled size (%s) — leaving position open %s",
                        filled_fp,
                        pos.market_id,
                    )
                    continue
                avg_exit_px, proceeds = kalshi_order_avg_contract_price_and_proceeds_for_held_side(
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
            else:
                logger.info("Paper exit simulated for %s", pos.market_id)
                exit_order_id = None

            if settings.trading_mode == "live":
                # Whole-contract ledger only: floor fill, scale proceeds/cost to whole contracts.
                sold_whole = max(0, int(math.floor(float(filled_fp) + 1e-9)))
                if sold_whole < 1:
                    logger.warning(
                        "Live exit fill had no whole contracts (%s filled_fp=%.6f) — leaving position open %s",
                        pos.market_id,
                        filled_fp,
                        pos.market_id,
                    )
                    continue
                sold_qty_trade = sold_whole
                scale = sold_whole / float(filled_fp) if filled_fp > 1e-9 else 1.0
                sold_proceeds = float(proceeds) * scale
                sold_px = float(avg_exit_px)
                exit_fees_scaled = float(kalshi_order_fees_dollars(sell_result)) * scale
                pos.fees_paid = float(getattr(pos, "fees_paid", 0) or 0) + exit_fees_scaled
                pos.dead_market = False
                pos.awaiting_settlement = False
                pre_qty = max(0, int(pos.quantity or 0))
                pre_entry_cost = float(pos.entry_cost or 0.0)
                pre_entry_price = float(pos.entry_price or 0.0)
                pre_sync_fees_paid = float(getattr(pos, "fees_paid", 0) or 0.0)
                per_contract_basis = float(cash_basis) / float(pre_qty) if pre_qty > 0 else 0.0
                sold_basis = per_contract_basis * float(sold_qty_trade)
                fill_integer = filled_fp > 1e-9 and abs(float(filled_fp) - round(float(filled_fp))) < 1e-6
                fifo_basis, fifo_ok = (0.0, False)
                if fill_integer and sold_qty_trade < pre_qty:
                    fifo_basis, fifo_ok = fifo_cost_for_next_sell(
                        db,
                        trade_mode=settings.trading_mode,
                        market_id=pos.market_id,
                        side=pos.side,
                        sell_qty=int(sold_qty_trade),
                    )
                gross_exit_notional = float(sold_px) * float(sold_qty_trade)
                realized = closed_leg_realized_pnl_kalshi_dollars(
                    quantity_sold=int(sold_qty_trade),
                    exit_price_per_contract_gross=sold_px,
                    entry_cost_at_open=pre_entry_cost,
                    entry_price_at_open=pre_entry_price,
                    quantity_at_open=pre_qty,
                    fees_paid_roundtrip=pre_sync_fees_paid,
                )

                db.add(Trade(
                    id=str(exit_order_id or uuid.uuid4()),
                    market_id=pos.market_id,
                    market_title=pos.market_title,
                    action="sell",
                    side=pos.side,
                    quantity=int(sold_qty_trade),
                    price=sold_px,
                    total_cost=gross_exit_notional,
                    realized_pnl=realized,
                    trade_mode=settings.trading_mode,
                ))

                synced = await sync_open_position_qty_cost_from_kalshi(kalshi_client, pos, db=db)
                if synced:
                    if int(pos.quantity or 0) <= 0:
                        # Kalshi flat-row sync zeros qty and often avg_price; keep exit leg + basis for history/UI.
                        pos.quantity = int(sold_qty_trade)
                        if pre_entry_price > 1e-12:
                            pos.entry_price = pre_entry_price
                        if pre_entry_cost > 1e-12:
                            pos.entry_cost = pre_entry_cost
                        pos.fees_paid = pre_sync_fees_paid
                        pos.status = "closed"
                        pos.closed_at = utc_now()
                        pos.exit_reason = exit_reason
                        pos.realized_pnl = realized
                        pos.current_price = sold_px
                        mark_position_kalshi_flat_reconcile_pending(pos)
                    else:
                        logger.info(
                            "Partial exit IOC filled: %s %s filled_fp=%.4f proceeds=%.2f remaining=%d (Kalshi sync)",
                            pos.market_id,
                            pos.side,
                            filled_fp,
                            sold_proceeds,
                            pos.quantity,
                        )
                        continue
                else:
                    remaining = max(0, int(pre_qty) - int(sold_qty_trade))
                    if remaining <= 0:
                        pos.status = "closed"
                        pos.closed_at = utc_now()
                        pos.exit_reason = exit_reason
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
                        logger.info(
                            "Partial exit IOC filled: %s %s filled_fp=%.4f proceeds=%.2f remaining=%d (local fallback)",
                            pos.market_id,
                            pos.side,
                            filled_fp,
                            sold_proceeds,
                            pos.quantity,
                        )
                        continue
            else:
                # Paper mode: treat as full close at current mark.
                realized = current_value - cash_basis
                pos.status = "closed"
                pos.closed_at = utc_now()
                pos.exit_reason = exit_reason
                pos.realized_pnl = realized

                db.add(Trade(
                    id=str(exit_order_id or uuid.uuid4()),
                    market_id=pos.market_id,
                    market_title=pos.market_title,
                    action="sell",
                    side=pos.side,
                    quantity=pos.quantity,
                    price=float(current_price),
                    total_cost=float(current_value),
                    realized_pnl=realized,
                    trade_mode=settings.trading_mode,
                ))

            await broadcast_fn({
                "type": "position_closed",
                "data": {
                    "market_id": pos.market_id,
                    "market_title": pos.market_title,
                    "side": pos.side,
                    "exit_reason": exit_reason,
                    "realized_pnl": realized,
                },
            })

        db.commit()

    except Exception as e:
        logger.error("Error in monitor_positions: %s", e)
        db.rollback()
    finally:
        db.close()


# ── Scan and trade ─────────────────────────────────────────────────────────────

async def scan_and_trade(
    kalshi_client, decision_engine, db_factory, broadcast_fn, settings
):
    """Fetch markets, apply local filter, escalate to the configured AI provider, execute qualifying trades."""
    from src.ai_provider import ai_provider_log_label
    from src.api.portfolio import get_xai_prepaid_balance_usd_cached
    from src.bot.scan_eligibility import refresh_order_search_scan_ui
    from src.database.models import DecisionLog, EventSeriesLock, Position, Trade, get_paper_cash_balance
    from src.reconcile.open_positions import get_open_position

    db = db_factory()
    ai_log = ai_provider_log_label(getattr(settings, "default_ai_provider", "gemini"))
    try:
        from src.database.models import get_vault_balance

        positions_open = db.query(Position).filter(
            Position.status == "open",
            Position.trade_mode == settings.trading_mode,
        ).all()
        num_open = len(positions_open)

        if settings.trading_mode == "paper":
            uninvested_cash = max(0.0, get_paper_cash_balance(db, settings.paper_starting_balance))
            portfolio = None
            api_cash = 0.0
        else:
            from src.clients.kalshi_client import resting_buy_collateral_estimate_usd

            portfolio = await kalshi_client.get_portfolio()
            api_cash = float(portfolio.get("cash", 0.0))
            resting_orders = await kalshi_client.list_orders(status="resting")
            resting_buy_reserve = resting_buy_collateral_estimate_usd(resting_orders)
            uninvested_cash = max(0.0, api_cash - resting_buy_reserve)
            logger.info(
                "Live cash: api=%.2f resting_orders=%d resting_buy_collateral~=%.2f risk_balance_after_reserve=%.2f",
                api_cash,
                len(resting_orders),
                resting_buy_reserve,
                uninvested_cash,
            )

        vault_balance = min(max(0.0, get_vault_balance(db, trade_mode=settings.trading_mode)), float(uninvested_cash))
        balance = max(0.0, float(uninvested_cash) - float(vault_balance))

        if settings.trading_mode == "paper":
            from src.reconcile.open_positions import display_estimated_price_optional

            def _nf(x):
                try:
                    v = float(x)
                    return v if v == v else 0.0
                except Exception:
                    return 0.0

            pv_paper = sum(
                _nf(display_estimated_price_optional(p) or 0.0) * _nf(p.quantity) for p in positions_open
            )
            total_portfolio_value = float(uninvested_cash) + pv_paper
        else:
            total_portfolio_value = float(portfolio.get("portfolio_value", api_cash))

        xai_prepaid = await get_xai_prepaid_balance_usd_cached()
        active_scan, scan_label = refresh_order_search_scan_ui(
            db,
            settings,
            balance,
            total_portfolio_value_usd=total_portfolio_value,
            xai_prepaid_balance_usd=xai_prepaid,
            open_position_count=num_open,
            ai_provider=getattr(settings, "default_ai_provider", "gemini"),
        )
        if not active_scan:
            logger.info(
                "Order search off (%s) balance=%.2f total_value=%.2f open_positions=%d",
                scan_label,
                balance,
                total_portfolio_value,
                num_open,
            )
            return

        # Use Kalshi-side close-time filtering to reduce wasted pagination.
        # Kalshi expects Unix timestamps in seconds.
        now_ts = int(datetime.now(timezone.utc).timestamp())
        fetch_hours = int(getattr(settings, "bot_markets_fetch_max_close_hours", settings.bot_max_hours))
        max_close_ts = now_ts + fetch_hours * 3600
        markets = await kalshi_client.get_markets({"status": "open", "mve_filter": "exclude", "max_close_ts": max_close_ts})
        tradeable: List[dict] = []
        fail_counts: Dict[str, int] = {}
        for m in markets:
            scan_min_vol = effective_scan_min_volume(
                float(settings.bot_min_volume),
                str(m.get("title") or m.get("market_title") or ""),
                str(m.get("event_ticker") or ""),
            )
            ok, reason = is_tradeable_market(
                m,
                settings.bot_max_hours,
                scan_min_vol,
                settings.bot_max_spread,
                settings.bot_min_top_size,
                settings.local_min_residual_payoff,
            )
            if ok:
                tradeable.append(m)
            else:
                key = reason.split("(")[0]
                fail_counts[key] = fail_counts.get(key, 0) + 1

        # ── Persistent event-series lock ─────────────────────────────────────
        # If we've ever executed a trade in an event series, never enter any other sibling strike again.
        # (Prevents contradictory YES/NO exposures across siblings; unlike AI debounce this is "indefinite".)
        locked_event_tickers: Set[str] = set()
        allowed_market_id_by_event: Dict[str, str] = {}
        for et, mid in (
            db.query(EventSeriesLock.event_ticker, EventSeriesLock.chosen_market_id)
            .filter(EventSeriesLock.trade_mode == settings.trading_mode)
            .all()
        ):
            etu = str(et or "").strip().upper()
            midu = normalize_market_id(str(mid or "")).upper()
            if etu and midu:
                locked_event_tickers.add(etu)
                allowed_market_id_by_event[etu] = midu

        if locked_event_tickers:
            before = len(tradeable)
            tradeable = _apply_event_series_locks(
                tradeable,
                locked_event_tickers=locked_event_tickers,
                allowed_market_id_by_event=allowed_market_id_by_event,
            )
            after = len(tradeable)
            if before != after:
                logger.info(
                    "Event series locks: tradeable filtered %d → %d (locked_events=%d)",
                    before,
                    after,
                    len(locked_event_tickers),
                )

        logger.info(
            "Scan: %d markets total | %d pass basic filter | failures: %s",
            len(markets), len(tradeable),
            " ".join(f"{k}={v}" for k, v in sorted(fail_counts.items())),
        )

        held_tickers = {
            (normalize_market_id(p.market_id) or "").strip().upper()
            for p in positions_open
            if (normalize_market_id(p.market_id) or "").strip()
        }

        # Tiered re-analysis cooldown:
        # - Markets that escalated to the AI provider: long debounce (API cost + stale signal window).
        # - Local-only outcomes (no LLM call): short debounce so one full sweep doesn't freeze
        #   the entire universe for 15 minutes — that made capacity look broken.
        now = utc_now()
        xai_cutoff = now - timedelta(minutes=15)
        local_debounce_sec = max(90, int(getattr(settings, "bot_scan_interval", 30)) * 2)
        local_cutoff = now - timedelta(seconds=local_debounce_sec)

        recent_xai_rows = (
            db.query(DecisionLog.market_id, DecisionLog.xai_analysis)
            .filter(
                DecisionLog.timestamp >= xai_cutoff,
                DecisionLog.escalated_to_xai.is_(True),
            )
            .all()
        )
        recent_xai = {
            normalize_market_id(str(mid or "")).upper() for mid, _xa in recent_xai_rows
        }
        # Event batch logs only the *chosen* market_id, but the model compared the full sibling set.
        # Without sibling cooldown, the next sweep re-queues the same event and can buy more strikes.
        explicit_batch_legs, legacy_batch_events = _cooldown_market_ids_from_event_batch_xai_jsons(
            [xa for _mid, xa in recent_xai_rows]
        )
        xai_batch_sibling_cooldown = explicit_batch_legs | _tradeable_market_ids_for_event_tickers(
            tradeable, legacy_batch_events
        )

        recent_local_only = {
            normalize_market_id(str(row.market_id or "")).upper()
            for row in db.query(DecisionLog)
            .filter(
                DecisionLog.timestamp >= local_cutoff,
                DecisionLog.escalated_to_xai.is_(False),
            )
            .with_entities(DecisionLog.market_id)
            .all()
        }
        recently_analyzed = recent_xai | recent_local_only | xai_batch_sibling_cooldown

        logger.debug(
            "Scan cooldown: ai_escalation_window=%d local_only_window=%d batch_event_sibling=%d (local_debounce=%ds)",
            len(recent_xai),
            len(recent_local_only),
            len(xai_batch_sibling_cooldown),
            local_debounce_sec,
        )

        reentry_cd_h = float(getattr(settings, "reentry_cooldown_hours", 0.0) or 0.0)
        loss_exit_cooldown_tickers: Set[str] = set()
        if reentry_cd_h > 0:
            cd_cutoff = utc_now() - timedelta(hours=reentry_cd_h)
            # Per ticker: only the **latest** close in the window matters — a later winning exit
            # clears cooldown from an earlier loss on the same market.
            latest_in_window: Dict[str, Tuple[datetime, float]] = {}
            for mid, ca, rp in (
                db.query(Position.market_id, Position.closed_at, Position.realized_pnl)
                .filter(
                    Position.status == "closed",
                    Position.trade_mode == settings.trading_mode,
                    Position.closed_at.isnot(None),
                    Position.closed_at >= cd_cutoff,
                )
                .all()
            ):
                if not mid:
                    continue
                k = normalize_market_id(mid).upper()
                prev = latest_in_window.get(k)
                if prev is None or ca > prev[0]:
                    latest_in_window[k] = (ca, float(rp or 0.0))
            loss_exit_cooldown_tickers = {k for k, (_, rp) in latest_in_window.items() if rp < 0}

        batch_completed_this_sweep: Set[str] = set()
        scan_queue = _tradeable_scan_queue(tradeable)
        full_sq = len(scan_queue)
        cap_u = int(getattr(settings, "bot_max_scan_queue_units_per_sweep", 0) or 0)
        if cap_u > 0:
            scan_queue = _cap_scan_queue_units_by_volume(scan_queue, cap_u)
            if len(scan_queue) < full_sq:
                logger.info(
                    "Scan queue volume-priority cap: %d -> %d unit(s) (bot_max_scan_queue_units_per_sweep=%d)",
                    full_sq,
                    len(scan_queue),
                    cap_u,
                )
        logger.info(
            "Scan sweep: %d queue unit(s) from %d tradeable market(s) (mode=%s)",
            len(scan_queue),
            len(tradeable),
            settings.trading_mode,
        )

        # Event titles are fetched lazily per batch/single unit (``get_event_title`` caches ~TTL).
        # Do **not** prefetch all unique events here — that is O(events)×HTTP and can stall the loop for minutes.

        _sweep_started = time.monotonic()
        _last_prog_log = _sweep_started
        for i_u, (unit_kind, et_key, members) in enumerate(scan_queue):
            now_mono = time.monotonic()
            if now_mono - _last_prog_log >= 60.0:
                logger.info(
                    "Scan sweep still running: unit %d/%d (~%.0fs elapsed)",
                    i_u + 1,
                    len(scan_queue),
                    now_mono - _sweep_started,
                )
                _last_prog_log = now_mono

            # Stop scanning when play/total balance/deployable/prepaid gates no longer allow new entries.
            xai_prepaid_now = await get_xai_prepaid_balance_usd_cached()
            active_now, scan_label_now = refresh_order_search_scan_ui(
                db,
                settings,
                balance,
                total_portfolio_value_usd=total_portfolio_value,
                xai_prepaid_balance_usd=xai_prepaid_now,
                open_position_count=num_open,
                ai_provider=getattr(settings, "default_ai_provider", "gemini"),
            )
            if not active_now:
                logger.info(
                    "Order search off mid-sweep (%s) balance=%.2f total_value=%.2f open_positions=%d",
                    scan_label_now,
                    balance,
                    total_portfolio_value,
                    num_open,
                )
                break

            if not is_bot_playing(db_factory):
                logger.info(
                    "Scan aborted — bot left play mode (pause/stop); skipping remaining markets "
                    "(no further %s escalation this sweep)",
                    ai_log,
                )
                break

            if unit_kind == "batch" and et_key:
                fresh_members: List[dict] = []
                for m in members:
                    tid = m.get("id", "")
                    nt = normalize_market_id(str(tid)).upper()
                    if nt in held_tickers or nt in recently_analyzed or tid in batch_completed_this_sweep:
                        continue
                    if reentry_cd_h > 0 and nt in loss_exit_cooldown_tickers:
                        continue
                    et_m = str(m.get("event_ticker") or "").strip().upper()
                    if _event_series_lock_blocks_market(
                        tid,
                        et_m,
                        locked_event_tickers=locked_event_tickers,
                        allowed_market_id_by_event=allowed_market_id_by_event,
                    ):
                        continue
                    fresh_members.append(m)
                if len(fresh_members) < 2:
                    for xm in members:
                        batch_completed_this_sweep.add(str(xm.get("id") or ""))
                    if len(fresh_members) == 1:
                        members = fresh_members
                        unit_kind = "single"
                        et_key = None
                    else:
                        continue
                else:
                    members = fresh_members

                if unit_kind == "batch" and et_key:
                    before_l = len(members)
                    members, n_trim, dropped_raw = shortlist_line_ladder_members_for_xai(
                        members, et_key, LINE_LADDER_MAX_LEGS_FOR_XAI
                    )
                    for dr in dropped_raw:
                        if dr:
                            batch_completed_this_sweep.add(dr)
                    if n_trim > 0:
                        logger.info(
                            "Ladder %s shortlist: %d -> %d leg(s) for event %s "
                            "(top %d by local volume/depth/spread rank)",
                            ai_log,
                            before_l,
                            len(members),
                            et_key,
                            LINE_LADDER_MAX_LEGS_FOR_XAI,
                        )
                    if len(members) < 2:
                        for xm in members:
                            batch_completed_this_sweep.add(str(xm.get("id") or ""))
                        if len(members) == 1:
                            unit_kind = "single"
                            et_key = None
                        else:
                            continue

            market: dict
            decision: Dict[str, Any]

            if unit_kind == "batch" and et_key:
                ev_display = ""
                try:
                    ev_display = (await kalshi_client.get_event_title(et_key)) or ""
                except Exception:
                    pass
                legs: List[Dict[str, Any]] = []
                for m in members:
                    tid = str(m.get("id") or "")
                    ypr = m.get("yes_price", 0.5)
                    npr = m.get("no_price", 0.5)
                    yaf = float(m.get("yes_ask") or 0.0)
                    naf = float(m.get("no_ask") or 0.0)
                    ypx = float(yaf) if yaf > 0 else float(ypr)
                    npx = float(naf) if naf > 0 else float(npr)
                    ctit = m.get("title", tid)
                    sub = m.get("subtitle") or ""
                    m_title = ctit
                    if ev_display:
                        tail = (sub or ctit).strip()
                        m_title = f"{ev_display} — {tail}" if tail else ev_display
                    legs.append(
                        {
                            "market_id": tid,
                            "market_title": m_title,
                            "market_description": enrich_ai_market_description(
                                (sub or ctit).strip(), m
                            ),
                            "event_ticker": (m.get("event_ticker") or "").strip(),
                            "current_prices": {
                                "yes": ypx,
                                "no": npx,
                                "yes_bid": m.get("yes_bid"),
                                "yes_ask": m.get("yes_ask"),
                                "no_bid": m.get("no_bid"),
                                "no_ask": m.get("no_ask"),
                                "yes_ask_size": m.get("yes_ask_size"),
                                "no_ask_size": m.get("no_ask_size"),
                                "local_vetting_notes": "Passed local vetting (liq/spread/volume/time).",
                            },
                            "yes_spread": m.get("yes_spread"),
                            "no_spread": m.get("no_spread"),
                            "volume": float(m.get("volume") or 0.0),
                            "expires_in_days": m.get("expires_in_days") or 1,
                            "close_time": m.get("close_time"),
                            "expected_expiration_time": m.get("expected_expiration_time"),
                            "vetting_horizon_time": m.get("vetting_horizon_time"),
                        }
                    )
                try:
                    decision = await decision_engine.analyze_event_batch(
                        event_ticker=et_key,
                        event_title=ev_display or et_key,
                        legs=legs,
                        min_24h_volume_contracts=float(settings.bot_min_volume),
                        min_top_ask_contracts=float(settings.bot_min_top_size),
                        max_spread=float(settings.bot_max_spread),
                        deployable_balance=float(balance),
                    )
                except Exception as e:
                    logger.error("Decision engine batch error for event %s: %s", et_key, e)
                    for xm in members:
                        batch_completed_this_sweep.add(str(xm.get("id") or ""))
                    continue

                mid_chosen = str(decision.get("market_id") or "").strip()
                market = None
                for m in members:
                    if normalize_market_id(str(m.get("id") or "")).upper() == normalize_market_id(
                        mid_chosen
                    ).upper():
                        market = m
                        break
                if market is None:
                    market = members[0]
                for xm in members:
                    batch_completed_this_sweep.add(str(xm.get("id") or ""))
            else:
                market = members[0]
                ticker = market.get("id", "")
                nt0 = normalize_market_id(str(ticker)).upper()
                if nt0 in held_tickers or nt0 in recently_analyzed or ticker in batch_completed_this_sweep:
                    continue
                if reentry_cd_h > 0 and nt0 in loss_exit_cooldown_tickers:
                    logger.info(
                        "Skip %s — reentry cooldown (losing exit within %.1fh on this ticker)",
                        ticker,
                        reentry_cd_h,
                    )
                    continue
                et_single = str(market.get("event_ticker") or "").strip().upper()
                if _event_series_lock_blocks_market(
                    ticker,
                    et_single,
                    locked_event_tickers=locked_event_tickers,
                    allowed_market_id_by_event=allowed_market_id_by_event,
                ):
                    logger.info(
                        "Skip %s — event series locked to %s",
                        ticker,
                        allowed_market_id_by_event.get(et_single),
                    )
                    continue

                try:
                    yes_price_raw = market.get("yes_price", 0.5)
                    no_price_raw = market.get("no_price", 0.5)
                    _yes_ask_f = float(market.get("yes_ask") or 0.0)
                    _no_ask_f = float(market.get("no_ask") or 0.0)
                    yes_price = float(_yes_ask_f) if _yes_ask_f > 0 else float(yes_price_raw)
                    no_price = float(_no_ask_f) if _no_ask_f > 0 else float(no_price_raw)
                    volume = market.get("volume", 0.0)
                    expires_days = market.get("expires_in_days") or 1
                    contract_title = market.get("title", ticker)
                    subtitle = market.get("subtitle") or ""
                    title = contract_title
                    try:
                        et_one = (market.get("event_ticker") or "").strip()
                        if et_one:
                            ev_title = (await kalshi_client.get_event_title(et_one)) or ""
                            if ev_title:
                                tail = (subtitle or contract_title).strip()
                                title = f"{ev_title} — {tail}" if tail else ev_title
                    except Exception:
                        pass
                    description = enrich_ai_market_description(
                        (subtitle or contract_title).strip(), market
                    )
                    yes_bid = market.get("yes_bid")
                    yes_ask = market.get("yes_ask")
                    no_bid = market.get("no_bid")
                    no_ask = market.get("no_ask")
                    yes_ask_size = market.get("yes_ask_size")
                    no_ask_size = market.get("no_ask_size")

                    decision = await decision_engine.analyze_market(
                        market_id=ticker,
                        market_title=title,
                        market_description=description,
                        current_prices={
                            "yes": yes_price,
                            "no": no_price,
                            "yes_bid": yes_bid,
                            "yes_ask": yes_ask,
                            "no_bid": no_bid,
                            "no_ask": no_ask,
                            "yes_ask_size": yes_ask_size,
                            "no_ask_size": no_ask_size,
                            "local_vetting_notes": f"Passed local vetting (liq/spread/volume/time).",
                        },
                        volume=volume,
                        expires_in_days=float(expires_days or 1.0),
                        close_time=market.get("close_time"),
                        expected_expiration_time=market.get("expected_expiration_time"),
                        vetting_horizon_time=market.get("vetting_horizon_time"),
                        market_timing=market,
                        deployable_balance=float(balance),
                    )
                except Exception as e:
                    logger.error("Decision engine error for %s: %s", ticker, e)
                    continue
                batch_completed_this_sweep.add(str(ticker))

            ticker = str(market.get("id") or "")
            ticker_clean = normalize_market_id(ticker)
            yes_price_raw = market.get("yes_price", 0.5)
            no_price_raw = market.get("no_price", 0.5)
            _yes_ask_f = float(market.get("yes_ask") or 0.0)
            _no_ask_f = float(market.get("no_ask") or 0.0)
            yes_price = float(_yes_ask_f) if _yes_ask_f > 0 else float(yes_price_raw)
            no_price = float(_no_ask_f) if _no_ask_f > 0 else float(no_price_raw)
            volume = market.get("volume", 0.0)
            expires_days = market.get("expires_in_days") or 1
            contract_title = market.get("title", ticker)
            subtitle = market.get("subtitle") or ""
            title = contract_title
            try:
                et = (market.get("event_ticker") or "").strip()
                if et:
                    ev_title = (await kalshi_client.get_event_title(et)) or ""
                    if ev_title:
                        tail = (subtitle or contract_title).strip()
                        title = f"{ev_title} — {tail}" if tail else ev_title
            except Exception:
                pass
            description = (subtitle or contract_title).strip()
            contractual_close = market.get("close_time")
            expected_expiration_iso = pick_display_expected_expiration_iso(market)
            _pos_et = (market.get("event_ticker") or "").strip()
            _pos_et_val = _pos_et if _pos_et else None

            decision_log_row_id = str(uuid.uuid4())
            signal = decision.get("decision", "SKIP")
            action_taken: Dict[str, Any]
            executed_trade = False
            stop_scan_after = False
            trade_side = ""
            trade_quantity = 0
            trade_price = 0.0
            trade_cost = 0.0
            order_id_out = ""

            if signal == "SKIP":
                action_taken = {
                    "status": "skipped",
                    "summary": decision.get("action_summary") or "Skipped.",
                }

            else:
                trade_side = "YES" if signal == "BUY_YES" else "NO"

                max_spread = float(getattr(settings, "bot_max_spread", 0.15))
                min_top = float(getattr(settings, "bot_min_top_size", 1.0))

                fail_reason = None
                if not is_bot_playing(db_factory):
                    logger.info(
                        "Skip execution %s — bot not in play after analysis (signal=%s)",
                        ticker,
                        signal,
                    )
                    fail_reason = "Skipped — bot paused/stopped before execution"
                if fail_reason is None:
                    fail_reason = buy_side_liquidity_skip_summary(
                        market,
                        trade_side,
                        max_spread=max_spread,
                        min_top_size=min_top,
                    )
                    if fail_reason:
                        logger.info("Skip %s %s — %s", ticker, trade_side, fail_reason)

                if fail_reason:
                    action_taken = {"status": "no_trade", "summary": fail_reason, "signal": signal}
                else:
                    exec_ask = executable_buy_best_ask_dollars(market, trade_side)
                    min_res = float(getattr(settings, "local_min_residual_payoff", 0.0))
                    gross = (1.0 - float(exec_ask)) if exec_ask is not None else None
                    entry_fail: Optional[str] = None
                    if exec_ask is None:
                        entry_fail = "Skipped — no executable buy ask"
                    elif gross is not None and gross <= 1e-9:
                        entry_fail = "Skipped — buy ask at or above $1 (no gross upside)"
                    elif (
                        gross is not None
                        and min_res > 1e-12
                        and gross + 1e-12 < min_res
                    ):
                        entry_fail = (
                            f"Skipped — gross upside ${gross:.2f}/contract below floor ({min_res:.2f})"
                        )
                    if entry_fail:
                        action_taken = {
                            "status": "no_trade",
                            "summary": entry_fail,
                            "signal": signal,
                        }
                    else:
                        trade_price = float(exec_ask)

                        y_ask_raw = float(market.get("yes_ask") or 0.0)
                        n_ask_raw = float(market.get("no_ask") or 0.0)
                        y_ask_f = y_ask_raw if y_ask_raw > 0 else None
                        n_ask_f = n_ask_raw if n_ask_raw > 0 else None
                        ai_yes = int(decision.get("ai_probability_yes_pct", 50) or 50)
                        edge_now = edge_pct_for_side(
                            trade_side, ai_yes, y_ask_f, n_ask_f, float(yes_price), float(no_price)
                        )
                        m_title = str(market.get("title") or decision.get("market_title") or "")
                        m_event = str(market.get("event_ticker") or "")
                        min_edge_base = effective_min_edge_for_market(
                            float(getattr(settings, "min_edge_to_buy_pct", DEFAULT_MIN_EDGE_TO_BUY_PCT)),
                            m_title,
                            m_event,
                        )
                        min_ai_base = int(
                            getattr(
                                settings,
                                "min_ai_win_prob_buy_side_pct",
                                DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT,
                            )
                        )
                        eff_min_edge, eff_min_ai, risk_tier = effective_buy_gate_thresholds(
                            side=trade_side,
                            ai_yes_pct=ai_yes,
                            yes_ask=y_ask_f,
                            no_ask=n_ask_f,
                            yes_mid=float(yes_price),
                            no_mid=float(no_price),
                            min_edge_base=min_edge_base,
                            min_ai_win_prob_base=min_ai_base,
                        )
                        ai_buy = ai_win_prob_pct_on_buy_side(trade_side, ai_yes)
                        risk_note = " (contrarian tier)" if risk_tier else ""
                        gate_fail = autonomous_buy_gate_failure(
                            side=trade_side,
                            ai_yes_pct=ai_yes,
                            edge_pct=edge_now,
                            entry_price_dollars=float(trade_price),
                        )
                        if gate_fail:
                            action_taken = {
                                "status": "no_trade",
                                "summary": gate_fail,
                                "signal": signal,
                            }
                        elif ai_buy < eff_min_ai:
                            action_taken = {
                                "status": "no_trade",
                                "summary": (
                                    f"Skipped — AI win prob on buy side {ai_buy}% < minimum {eff_min_ai}%"
                                    f"{risk_note}"
                                ),
                                "signal": signal,
                            }
                        elif edge_now + 1e-9 < float(eff_min_edge):
                            action_taken = {
                                "status": "no_trade",
                                "summary": (
                                    f"Skipped — edge {edge_now:.1f} pts < minimum {eff_min_edge:.1f} pts"
                                    f"{risk_note}"
                                ),
                                "signal": signal,
                            }
                        else:
                            kelly_cap = kelly_contract_cap_for_bankroll(
                                float(balance), float(trade_price)
                            )
                            quantity, kelly_sizing_tag = kelly_contracts_for_order(
                                float(balance),
                                trade_side,
                                ai_yes,
                                y_ask_f,
                                n_ask_f,
                                float(yes_price),
                                float(no_price),
                                per_contract_premium=float(trade_price),
                                max_kelly_contracts=kelly_cap,
                            )
                            if quantity < 1:
                                kelly_skip = kelly_order_skip_summary(
                                    float(balance),
                                    trade_side,
                                    ai_yes,
                                    y_ask_f,
                                    n_ask_f,
                                    float(yes_price),
                                    float(no_price),
                                    per_contract_premium=float(trade_price),
                                    max_kelly_contracts=kelly_cap,
                                )
                                action_taken = {
                                    "status": "no_trade",
                                    "summary": kelly_skip
                                    or (
                                        "Skipped — Kelly size is zero and available cash cannot buy "
                                        "a whole contract at current prices"
                                    ),
                                    "signal": signal,
                                }
                            else:
                                if kelly_sizing_tag == "single_contract_retry":
                                    decision["kelly_single_contract_retry"] = True
                                    xa = decision.get("xai_analysis")
                                    if isinstance(xa, dict):
                                        xa["kelly_single_contract_retry"] = True
                                elif kelly_sizing_tag == "cash_capped":
                                    decision["kelly_cash_capped"] = True
                                    xa = decision.get("xai_analysis")
                                    if isinstance(xa, dict):
                                        xa["kelly_cash_capped"] = True
                                decision["kelly_contracts"] = int(quantity)
                                cost = quantity * trade_price
                                if settings.trading_mode == "paper" and cost > balance + 1e-9:
                                    logger.info(
                                        "Insufficient paper cash for %s (%s x%d @ %.3f cost=%.2f > balance=%.2f) — stopping scan",
                                        ticker, trade_side, quantity, trade_price, cost, balance,
                                    )
                                    action_taken = {
                                        "status": "no_trade",
                                        "summary": "Skipped — not enough cash",
                                        "signal": signal,
                                    }
                                    stop_scan_after = True
                                else:
                                    traded_at = datetime.now(timezone.utc)
                                    if settings.trading_mode == "live":
                                        from src.clients.kalshi_client import (
                                            kalshi_order_avg_contract_price_and_cost_for_held_side,
                                            kalshi_order_fees_dollars,
                                            kalshi_order_fill_cost_dollars,
                                            kalshi_order_filled_contracts,
                                            live_ioc_buy_cap_dollars,
                                        )
    
                                        ask_px = float(trade_price)
                                        ioc_limit_dollars = live_ioc_buy_cap_dollars(market, trade_side)
    
                                        if ask_px is None or ioc_limit_dollars is None:
                                            logger.info(
                                                "Skip IOC buy %s %s — no usable ask (ask=%s cap=%s)",
                                                ticker,
                                                trade_side,
                                                ask_px,
                                                ioc_limit_dollars,
                                            )
                                            action_taken = {
                                                "status": "no_trade",
                                                "summary": "Skipped — no actionable ask for IOC buy",
                                                "signal": signal,
                                            }
                                        else:
                                            result = await kalshi_client.place_buy_ioc_limit(
                                                ticker, trade_side, quantity, ioc_limit_dollars
                                            )
                                            if result.get("error"):
                                                logger.warning(
                                                    "Live buy failed %s %s: %s",
                                                    ticker,
                                                    trade_side,
                                                    result["error"],
                                                )
                                                action_taken = {
                                                    "status": "no_trade",
                                                    "summary": f"Kalshi error: {result['error']}",
                                                    "signal": signal,
                                                }
                                            else:
                                                filled = kalshi_order_filled_contracts(result)
                                                qty_int = max(0, int(math.floor(float(filled) + 1e-9)))
                                                if qty_int < 1:
                                                    logger.warning(
                                                        "Live buy had no whole-contract fill — %s %s filled_fp=%.6f status=%s",
                                                        ticker,
                                                        trade_side,
                                                        filled,
                                                        result.get("status"),
                                                    )
                                                    action_taken = {
                                                        "status": "no_trade",
                                                        "summary": "Fill was fractional or empty; no whole-contract position recorded",
                                                        "signal": signal,
                                                        "kalshi_status": result.get("status"),
                                                    }
                                                else:
                                                    if qty_int < quantity:
                                                        logger.info(
                                                            "Live IOC buy partial fill %s %s filled=%d requested=%d",
                                                            ticker_clean,
                                                            trade_side,
                                                            qty_int,
                                                            quantity,
                                                        )
                                                    avg_px, full_cost = kalshi_order_avg_contract_price_and_cost_for_held_side(
                                                        result,
                                                        held_side=trade_side,
                                                        filled=filled,
                                                        fallback_per_contract_dollars=float(ioc_limit_dollars),
                                                    )
                                                    scale = qty_int / float(filled) if filled > 1e-9 else 1.0
                                                    buy_fees = float(kalshi_order_fees_dollars(result)) * scale
                                                    fill_notional = float(kalshi_order_fill_cost_dollars(result)) * scale
                                                    if fill_notional <= 1e-12 and float(full_cost) > 1e-12:
                                                        fill_notional = max(
                                                            0.0, float(full_cost) * scale - buy_fees
                                                        )
                                                    order_id_out = (
                                                        result.get("order_id")
                                                        or result.get("client_order_id")
                                                        or str(uuid.uuid4())
                                                    )
                                                    db.add(
                                                        Trade(
                                                            id=order_id_out,
                                                            market_id=ticker_clean,
                                                            market_title=title,
                                                            action="buy",
                                                            side=trade_side,
                                                            quantity=qty_int,
                                                            price=avg_px,
                                                            total_cost=fill_notional,
                                                            trade_mode=settings.trading_mode,
                                                        )
                                                    )
                                                    existing_open = get_open_position(
                                                        db,
                                                        trade_mode=settings.trading_mode,
                                                        market_id=ticker_clean,
                                                        side=trade_side,
                                                    )
                                                    if not existing_open:
                                                        db.add(
                                                            Position(
                                                                id=str(uuid.uuid4()),
                                                                market_id=ticker_clean,
                                                                market_title=title,
                                                                event_ticker=_pos_et_val,
                                                                side=trade_side,
                                                                quantity=qty_int,
                                                                entry_price=avg_px,
                                                                entry_cost=fill_notional,
                                                                entry_decision_log_id=decision_log_row_id,
                                                                stop_loss_drawdown_pct_at_entry=float(settings.stop_loss_drawdown_pct),
                                                                current_price=avg_px,
                                                                fees_paid=buy_fees,
                                                                status="open",
                                                                close_time=contractual_close,
                                                                expected_expiration_time=expected_expiration_iso,
                                                                trade_mode=settings.trading_mode,
                                                            )
                                                        )
                                                    else:
                                                        existing_open.quantity += qty_int
                                                        existing_open.entry_cost += fill_notional
                                                        existing_open.fees_paid = float(
                                                            getattr(existing_open, "fees_paid", 0) or 0
                                                        ) + buy_fees
                                                        if int(existing_open.quantity or 0) > 0:
                                                            existing_open.entry_price = (
                                                                existing_open.entry_cost / existing_open.quantity
                                                            )

                                                    action_taken = {
                                                        "status": "executed",
                                                        "side": trade_side,
                                                        "quantity": qty_int,
                                                        "price": avg_px,
                                                        "cost": round(fill_notional + buy_fees, 6),
                                                        "at": utc_iso_z(traded_at),
                                                        "execution": "ioc_limit",
                                                        "ioc_limit_dollars": round(ioc_limit_dollars, 4),
                                                    }
                                                    executed_trade = True
                                                    trade_quantity = qty_int
                                                    trade_price = avg_px
                                                    trade_cost = fill_notional + buy_fees
                                    else:
                                        order_id_out = str(uuid.uuid4())
                                        logger.info(
                                            "Paper trade: %s %s x%d @ %.3f",
                                            trade_side,
                                            ticker_clean,
                                            quantity,
                                            trade_price,
                                        )
    
                                        db.add(Trade(
                                            id=order_id_out,
                                            market_id=ticker_clean,
                                            market_title=title,
                                            action="buy",
                                            side=trade_side,
                                            quantity=quantity,
                                            price=trade_price,
                                            total_cost=cost,
                                            trade_mode=settings.trading_mode,
                                        ))
    
                                        existing_open = get_open_position(
                                            db,
                                            trade_mode=settings.trading_mode,
                                            market_id=ticker_clean,
                                            side=trade_side,
                                        )
                                        if not existing_open:
                                                db.add(Position(
                                                    id=str(uuid.uuid4()),
                                                    market_id=ticker_clean,
                                                    market_title=title,
                                                    event_ticker=_pos_et_val,
                                                    side=trade_side,
                                                    quantity=quantity,
                                                    entry_price=trade_price,
                                                    entry_cost=cost,
                                                    entry_decision_log_id=decision_log_row_id,
                                                    stop_loss_drawdown_pct_at_entry=float(settings.stop_loss_drawdown_pct),
                                                    current_price=trade_price,
                                                    status="open",
                                                    close_time=contractual_close,
                                                    expected_expiration_time=expected_expiration_iso,
                                                    trade_mode=settings.trading_mode,
                                                ))
                                        else:
                                            existing_open.quantity += quantity
                                            existing_open.entry_cost += cost
                                            if int(existing_open.quantity or 0) > 0:
                                                existing_open.entry_price = (
                                                    existing_open.entry_cost / existing_open.quantity
                                                )
    
                                        action_taken = {
                                            "status": "executed",
                                            "side": trade_side,
                                            "quantity": quantity,
                                            "price": trade_price,
                                            "cost": cost,
                                            "at": utc_iso_z(traded_at),
                                        }
                                        executed_trade = True
                                        trade_quantity = quantity
                                        trade_cost = cost

            decision["action_taken"] = action_taken

            _snap = {
                "yes_price": float(yes_price),
                "no_price": float(no_price),
                "volume": float(volume or 0.0),
                "expires_in_days": float(expires_days) if expires_days is not None else None,
            }
            decision["yes_price"] = _snap["yes_price"]
            decision["no_price"] = _snap["no_price"]
            decision["volume"] = _snap["volume"]
            decision["expires_in_days"] = _snap["expires_in_days"]

            db.add(DecisionLog(
                id=decision_log_row_id,
                market_id=ticker_clean,
                market_title=title,
                decision=decision.get("decision", "SKIP"),
                xai_analysis=json.dumps(decision.get("xai_analysis", {})),
                confidence=float(decision.get("confidence", 0.0) or 0.0),
                reasoning=decision.get("reasoning", ""),
                real_time_context=decision.get("real_time_context", ""),
                key_factors=json.dumps(decision.get("key_factors", [])),
                yes_confidence=int(decision.get("yes_confidence", int(yes_price * 100))),
                no_confidence=int(decision.get("no_confidence", int(no_price * 100))),
                escalated_to_xai=decision.get("escalated_to_xai", False),
                edge=float(decision.get("edge_pct", 0.0) or 0.0),
                ai_probability_yes_pct=int(decision.get("ai_probability_yes_pct", 50) or 50),
                market_implied_probability_pct=int(decision.get("market_implied_probability_pct", 0) or 0),
                kelly_contracts=int(decision.get("kelly_contracts", 0) or 0),
                filter_pass=True,
                action_taken=json.dumps(action_taken),
                market_context=json.dumps(_snap),
                snapshot_yes_price=_snap["yes_price"],
                snapshot_no_price=_snap["no_price"],
                snapshot_volume=_snap["volume"],
                snapshot_expires_days=_snap["expires_in_days"],
                trade_mode=settings.trading_mode,
            ))
            db.commit()

            decision["trade_mode"] = settings.trading_mode
            decision["market_id"] = ticker_clean
            for _k in ("local_score", "risk_level", "target_price"):
                decision.pop(_k, None)
            _xa = decision.get("xai_analysis")
            if isinstance(_xa, dict):
                for _k in ("risk_level", "target_price"):
                    _xa.pop(_k, None)
            enrich_analysis_ai_provider(decision)
            await broadcast_fn({"type": "analysis", "data": decision})

            if executed_trade:
                held_tickers.add((ticker_clean or "").strip().upper())
                balance -= trade_cost
                num_open += 1

                # Lock the full event series so we never buy a contradictory sibling strike later.
                et_lock = (market.get("event_ticker") or "").strip().upper()
                if et_lock:
                    try:
                        mid_lock = normalize_market_id(str(ticker)).upper()
                        existing = (
                            db.query(EventSeriesLock)
                            .filter(
                                EventSeriesLock.trade_mode == settings.trading_mode,
                                EventSeriesLock.event_ticker == et_lock,
                            )
                            .first()
                        )
                        if existing is None:
                            db.add(
                                EventSeriesLock(
                                    id=str(uuid.uuid4()),
                                    trade_mode=settings.trading_mode,
                                    event_ticker=et_lock,
                                    chosen_market_id=mid_lock,
                                    chosen_side=str(trade_side or "").upper() if trade_side else None,
                                )
                            )
                            db.commit()
                            locked_event_tickers.add(et_lock)
                            allowed_market_id_by_event[et_lock] = mid_lock
                            logger.info("Locked event series %s to %s (%s)", et_lock, mid_lock, trade_side)
                    except Exception as e:
                        logger.warning("Failed to lock event series %s: %s", et_lock, e)

                await broadcast_fn({
                    "type": "trade_placed",
                    "data": {
                        "market_id": ticker_clean,
                        "market_title": title,
                        "side": trade_side,
                        "quantity": trade_quantity,
                        "price": trade_price,
                        "mode": settings.trading_mode,
                    },
                })

                await asyncio.sleep(1)

            if stop_scan_after:
                break

        logger.info(
            "Scan sweep finished: processed %d unit(s) in ~%.1fs",
            len(scan_queue),
            time.monotonic() - _sweep_started,
        )

    except Exception as e:
        logger.error("Error in scan_and_trade: %s", e)
        db.rollback()
    finally:
        db.close()


# ── Main loop ──────────────────────────────────────────────────────────────────

async def run_bot_loop(
    kalshi_client,
    decision_engine,
    db_factory,
    broadcast_fn: Callable[[dict], Coroutine],
    settings,
):
    """Long-running background coroutine that drives the autonomous trading bot."""
    logger.info("Bot loop started (scan_interval=%ds)", settings.bot_scan_interval)
    from src.api.tuning import sync_runtime_from_db

    while True:
        try:
            await asyncio.sleep(settings.bot_scan_interval)

            db_tune = db_factory()
            try:
                sync_runtime_from_db(db_tune)
            finally:
                db_tune.close()

            state = get_bot_state_str(db_factory)
            logger.info(
                "Bot cycle — state=%s trading_mode=%s (next: positions then scan if play)",
                state,
                settings.trading_mode,
            )

            # Always refresh open positions. When stopped, do not auto-exit.
            await monitor_positions(
                kalshi_client,
                db_factory,
                broadcast_fn,
                settings,
                allow_exits=(state != "stop"),
                bot_state_label=state,
            )

            await _maybe_auto_refresh_closed_resolution(
                kalshi_client,
                db_factory,
                broadcast_fn,
                settings,
            )

            if state == "stop":
                continue

            if state == "pause":
                continue

            # Play mode: full scan + trade
            scan_timeout = int(getattr(settings, "bot_loop_scan_timeout_sec", 0) or 0)
            if scan_timeout > 0:
                try:
                    await asyncio.wait_for(
                        scan_and_trade(
                            kalshi_client, decision_engine, db_factory, broadcast_fn, settings
                        ),
                        timeout=float(scan_timeout),
                    )
                except asyncio.TimeoutError:
                    logger.error(
                        "scan_and_trade exceeded bot_loop_scan_timeout_sec=%ss — aborting this sweep; "
                        "next cycle will retry. Raise timeout or reduce scan universe if this repeats.",
                        scan_timeout,
                    )
            else:
                await scan_and_trade(
                    kalshi_client, decision_engine, db_factory, broadcast_fn, settings
                )

        except asyncio.CancelledError:
            logger.info("Bot loop cancelled")
            break
        except Exception as e:
            logger.error("Unhandled error in bot loop: %s", e)
            await asyncio.sleep(10)
