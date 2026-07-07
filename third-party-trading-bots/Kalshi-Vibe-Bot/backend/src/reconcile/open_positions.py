"""Single open row per (trade_mode, market_id, side): normalize keys, dedupe, query helpers."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from src.database.models import Position


def normalize_market_id(market_id: str | None) -> str:
    """Trim; collapse accidental ``KXX…`` → ``KX…`` for stable ticker keys."""
    mid = (market_id or "").strip()
    if len(mid) >= 5 and mid.startswith("KXX") and mid[3].isalpha():
        return "KX" + mid[3:]
    return mid


def normalize_side(side: str | None) -> str:
    return (side or "").upper()


def position_open_key(market_id: str | None, side: str | None) -> Tuple[str, str]:
    return (normalize_market_id(market_id), normalize_side(side))


def open_cash_basis_dollars(
    entry_cost: float,
    entry_price: float,
    quantity: int,
    fees_paid: float,
) -> float:
    """Cash in for the leg: contract notional + **all** trading fees (buy + sell).

    When ``entry_cost`` is larger than ``entry_price``×qty, the excess is treated as buy-side
    charges already folded into ``entry_cost``. ``fees_paid`` may still include sell fees and any
    buy fees not in ``entry_cost`` — we add ``max(0, fees_paid - excess)`` so sell fees are never
    dropped (previously returned ``entry_cost`` only and understated basis vs UI / worthless exits).
    """
    ec = max(0.0, float(entry_cost or 0.0))
    fp = max(0.0, float(fees_paid or 0.0))
    q = max(0, int(quantity or 0))
    ep_line = float(entry_price or 0.0) * float(q)
    if fp <= 1e-12:
        return ec
    if q <= 0:
        return ec + fp
    tol = max(1e-6, 1e-4 * max(abs(ep_line), 1.0))
    if ec <= ep_line + tol:
        return ec + fp
    embedded_above_notional = ec - ep_line
    extra_fees = max(0.0, fp - embedded_above_notional)
    return ec + extra_fees


def open_position_cash_basis_dollars(pos: Position) -> float:
    """Same formula as :func:`open_cash_basis_dollars`, including inferred ``entry_cost`` when missing."""
    q = max(0, int(pos.quantity or 0))
    ec = max(0.0, float(pos.entry_cost or 0.0))
    ep = float(pos.entry_price or 0.0)
    if ec <= 1e-12 and ep > 0 and q > 0:
        ec = ep * float(q)
    return open_cash_basis_dollars(
        ec,
        ep,
        q,
        float(getattr(pos, "fees_paid", 0) or 0.0),
    )


# Trading-complete Kalshi API statuses — ``expected_expiration_time`` can remain far past contractual ``close_time``;
# Ends column must track contractual close so rows don’t show multi-day countdown while markets are already halted.
# Kalshi lifecycle (trade-api): ``active`` → ``closed`` (trading stopped, outcome not yet official) → ``determined``
# (yes/no known, settlement pending) → ``finalized`` (terminal; payouts complete). ``settled`` may alias ``finalized``.
_POSITION_DISPLAY_USE_CONTRACTUAL_ENDS_STATUSES = frozenset({"closed", "determined", "finalized", "settled"})

# When ``kalshi_market_result`` is ``yes``/``no``, these API lifecycle values mean the binary outcome is official
# for intrinsic display. ``closed``+result is allowed for API lag / transitional payloads.
_KALSHI_STATUSES_OFFICIAL_BINARY_RESULT = frozenset({"determined", "finalized", "settled", "closed"})
_KALSHI_STATUSES_PAYOUT_COMPLETE = frozenset({"finalized", "settled"})
_TRADEABLE_KALSHI_STATUSES = frozenset({"active", "open"})


def _iso_instant_strictly_before(a: str, b: str) -> bool:
    try:
        da = datetime.fromisoformat(a.replace("Z", "+00:00"))
        db = datetime.fromisoformat(b.replace("Z", "+00:00"))
        if da.tzinfo is None:
            da = da.replace(tzinfo=timezone.utc)
        if db.tzinfo is None:
            db = db.replace(tzinfo=timezone.utc)
        return da < db
    except Exception:
        return False


def _utc_reference(reference_now: Optional[datetime]) -> datetime:
    now_dt = reference_now if reference_now is not None else datetime.now(timezone.utc)
    if now_dt.tzinfo is None:
        now_dt = now_dt.replace(tzinfo=timezone.utc)
    return now_dt


def _tradeable_option_c_contract_close_iso(
    *,
    kalshi_status: str,
    exp_s: str,
    ct_s: str,
    reference_now: datetime,
) -> Optional[str]:
    """Return contractual ``close_time`` ISO when vetting falls back to contractual close; else ``None``."""
    st = kalshi_status.strip().lower()
    if st not in _TRADEABLE_KALSHI_STATUSES:
        return None
    if not exp_s or not ct_s or not _iso_instant_strictly_before(exp_s, ct_s):
        return None
    try:
        peg = datetime.fromisoformat(exp_s.replace("Z", "+00:00"))
        if peg.tzinfo is None:
            peg = peg.replace(tzinfo=timezone.utc)
        if peg <= reference_now:
            return ct_s
    except Exception:
        pass
    return None


def position_display_ends_contract_fallback_active(
    pos: Position, *, reference_now: Optional[datetime] = None
) -> bool:
    """True when Ends uses contractual ``close_time`` after a passed provisional peg (Option C) — UI hint."""
    now_dt = _utc_reference(reference_now)
    st = (getattr(pos, "kalshi_market_status", None) or "").strip().lower()
    exp_raw = getattr(pos, "expected_expiration_time", None)
    ct_raw = getattr(pos, "close_time", None)
    exp_s = str(exp_raw).strip() if exp_raw is not None else ""
    ct_s = str(ct_raw).strip() if ct_raw is not None else ""
    return (
        _tradeable_option_c_contract_close_iso(
            kalshi_status=st, exp_s=exp_s, ct_s=ct_s, reference_now=now_dt
        )
        is not None
    )


def _earliest_iso_string(*candidates: object) -> Optional[str]:
    """Earliest UTC instant among non-empty ISO strings; ``None`` if none parse."""
    best_dt: Optional[datetime] = None
    best_s: Optional[str] = None
    for v in candidates:
        s = str(v).strip() if v is not None else ""
        if not s:
            continue
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            dt = dt.astimezone(timezone.utc)
        except Exception:
            continue
        if best_dt is None or dt < best_dt:
            best_dt = dt
            best_s = s
    return best_s


def position_display_ends_iso(pos: Position, *, reference_now: Optional[datetime] = None) -> Optional[str]:
    """ISO instant for dashboard Ends column (``ends_at``).

    While tradeable (typically ``active`` / ``open``), prefer ``expected_expiration_time`` when present — closer to event end.

    **Hybrid guard (Option C):** when tradeable and ``expected_expiration_time`` is strictly before contractual ``close_time``,
    Kalshi may expose an early provisional peg that passes while ``status`` is still tradeable — avoid phantom ``Ended`` / outcome-pending
    by switching to ``close_time`` **only after** that provisional peg is at or before ``reference_now`` (defaults to UTC now).

    Once Kalshi marks the market past tradeable (``closed``, ``determined``, ``finalized``, …), use the
    **earliest** parseable instant among contractual ``close_time`` and stored ``expected_expiration_time``
    (after sync, the latter may hold ``occurrence_datetime`` for terminal rows — closer to when the event ran).

    ``reference_now`` is for tests; callers omit it in production.
    """
    now_dt = _utc_reference(reference_now)

    st = (getattr(pos, "kalshi_market_status", None) or "").strip().lower()
    if st in _POSITION_DISPLAY_USE_CONTRACTUAL_ENDS_STATUSES:
        earliest = _earliest_iso_string(
            getattr(pos, "close_time", None),
            getattr(pos, "expected_expiration_time", None),
        )
        if earliest:
            return earliest

    exp_raw = getattr(pos, "expected_expiration_time", None)
    ct_raw = getattr(pos, "close_time", None)
    exp_s = str(exp_raw).strip() if exp_raw is not None else ""
    ct_s = str(ct_raw).strip() if ct_raw is not None else ""

    opt_c = _tradeable_option_c_contract_close_iso(
        kalshi_status=st, exp_s=exp_s, ct_s=ct_s, reference_now=now_dt
    )
    if opt_c is not None:
        return opt_c

    if exp_s:
        return exp_s
    if ct_s:
        return ct_s
    return None


def position_market_close_time_passed(pos: Position, *, reference_now: Optional[datetime] = None) -> bool:
    """True when the display deadline (expected event end or contractual close) is at or before UTC now."""
    iso = position_display_ends_iso(pos, reference_now=reference_now)
    if not iso:
        return False
    try:
        ctp = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if ctp.tzinfo is None:
            ctp = ctp.replace(tzinfo=timezone.utc)
        now_dt = _utc_reference(reference_now)
        return ctp <= now_dt
    except Exception:
        return False


def kalshi_binary_outcome_official_for_display(pos: Position) -> bool:
    """True when stored status + ``yes``/``no`` result are enough to mark intrinsic value (not still pre-result)."""
    st = (getattr(pos, "kalshi_market_status", None) or "").strip().lower()
    res = (getattr(pos, "kalshi_market_result", None) or "").strip().lower()
    if res not in ("yes", "no"):
        return False
    # Never treat still-tradeable rows as settled (should not carry a result, but guard anyway).
    if st in _TRADEABLE_KALSHI_STATUSES:
        return False
    return st in _KALSHI_STATUSES_OFFICIAL_BINARY_RESULT


def resolution_intrinsic_mark_dollars(pos: Position) -> Optional[float]:
    """Binary payoff per held contract when Kalshi reports an official ``yes``/``no``; else ``None``."""
    res = (getattr(pos, "kalshi_market_result", None) or "").strip().lower()
    if not kalshi_binary_outcome_official_for_display(pos) or res not in ("yes", "no"):
        return None
    side = (pos.side or "").upper()
    if side == "YES":
        return 1.0 if res == "yes" else 0.0
    if side == "NO":
        return 1.0 if res == "no" else 0.0
    return None


def display_estimated_price_optional(pos: Position) -> Optional[float]:
    """Per-contract Est. Value for API/UI.

    When Kalshi reports an official binary outcome (see ``resolution_intrinsic_mark_dollars``), return
    intrinsic ``0`` or ``1`` **even if** contractual ``close_time`` is still in the future (common for
    sports props where the event resolves before the series contractual end).

    Otherwise, after the display **Ends** instant has passed: ``None`` until an official ``yes``/``no``
    is available (outcome pending). Before that: Kalshi **last trade** on YES (stored ``estimated_price``)
    or bid/current.
    """
    intrinsic = resolution_intrinsic_mark_dollars(pos)
    if intrinsic is not None:
        return float(intrinsic)
    if position_market_close_time_passed(pos):
        return None
    ep = getattr(pos, "estimated_price", None)
    if ep is not None:
        return max(0.0, min(1.0, float(ep)))
    return float(pos.bid_price or pos.current_price or 0.0)


def unrealized_pnl_display_optional(pos: Position) -> Optional[float]:
    """Display unrealized P&L; ``None`` maps to Outcome Pending when post-close resolution unknown."""
    q = max(0, int(pos.quantity or 0))
    ec = float(pos.entry_cost or 0.0)
    ep = float(pos.entry_price or 0.0)
    fp = float(getattr(pos, "fees_paid", 0) or 0.0)

    intrinsic = resolution_intrinsic_mark_dollars(pos)
    if intrinsic is not None:
        return unrealized_pnl_from_executable_mark_dollars(
            mark_last=float(intrinsic),
            quantity=q,
            entry_cost=ec,
            entry_price=ep,
            fees_paid=fp,
        )
    if position_market_close_time_passed(pos):
        return None

    mark_live = display_estimated_price_optional(pos)
    assert mark_live is not None
    return unrealized_pnl_from_executable_mark_dollars(
        mark_last=float(mark_live),
        quantity=q,
        entry_cost=ec,
        entry_price=ep,
        fees_paid=fp,
    )


def stop_loss_value_drawdown_triggered(
    *,
    entry_price_per_contract: float,
    estimated_price_per_contract: Optional[float],
    stop_loss_drawdown_pct: float,
) -> bool:
    """True when per-contract mark drawdown meets stop threshold (same framing as dashboard).

    ``drawdown = (entry_price − est_value) / entry_price`` on the held side (¢ vs ¢), **excluding fees**.
    When entry and Est. Value match (e.g. both 52¢), drawdown is 0%. Uses ``display_estimated_price_optional``
    for Est. Value. Returns False when entry is unusable or Est. Value is unknown.
    """
    entry_px = max(0.0, min(1.0, float(entry_price_per_contract or 0.0)))
    if not math.isfinite(entry_px) or entry_px <= 1e-12:
        return False
    if estimated_price_per_contract is None:
        return False
    est_px = float(estimated_price_per_contract)
    if not math.isfinite(est_px):
        return False
    est_px = max(0.0, min(1.0, est_px))
    dd = (entry_px - est_px) / entry_px
    sl = max(0.0, float(stop_loss_drawdown_pct))
    return dd >= sl - 1e-9


def stop_loss_entry_price_per_contract(pos: Position) -> float:
    """Held-side entry $/contract for stop-loss (``entry_price``, else ``entry_cost`` / qty)."""
    ep = float(pos.entry_price or 0.0)
    if ep > 1e-12:
        return max(0.0, min(1.0, ep))
    q = max(0, int(pos.quantity or 0))
    ec = max(0.0, float(pos.entry_cost or 0.0))
    if q > 0 and ec > 1e-12:
        return max(0.0, min(1.0, ec / float(q)))
    return 0.0


def stop_loss_mark_drawdown_fraction(
    pos: Position,
    *,
    estimated_price_per_contract: Optional[float] = None,
) -> Optional[float]:
    """``(entry − est) / entry`` for UI preview; ``None`` when not computable."""
    entry_px = stop_loss_entry_price_per_contract(pos)
    if entry_px <= 1e-12:
        return None
    est = (
        estimated_price_per_contract
        if estimated_price_per_contract is not None
        else display_estimated_price_optional(pos)
    )
    if est is None:
        return None
    est_px = max(0.0, min(1.0, float(est)))
    if not math.isfinite(est_px):
        return None
    return (entry_px - est_px) / entry_px


def stop_loss_triggered_from_position(pos: Position, *, stop_loss_drawdown_pct: float) -> bool:
    """Stop-loss auto-exit: **entry price** vs display **Est. Value** (per contract, fees excluded)."""
    est = display_estimated_price_optional(pos)
    return stop_loss_value_drawdown_triggered(
        entry_price_per_contract=stop_loss_entry_price_per_contract(pos),
        estimated_price_per_contract=float(est) if est is not None else None,
        stop_loss_drawdown_pct=stop_loss_drawdown_pct,
    )


def resolution_outcome_pending_display(pos: Position) -> bool:
    """Post-close row still waiting on an official binary outcome (Kalshi ``closed`` before ``determined``)."""
    return position_market_close_time_passed(pos) and resolution_intrinsic_mark_dollars(pos) is None


def resolution_awaiting_payout_display(pos: Position) -> bool:
    """Post-close: yes/no known and Kalshi is ``determined`` (settlement pending), not yet ``finalized``."""
    if not position_market_close_time_passed(pos) or resolution_intrinsic_mark_dollars(pos) is None:
        return False
    st = (getattr(pos, "kalshi_market_status", None) or "").strip().lower()
    if st in _KALSHI_STATUSES_PAYOUT_COMPLETE:
        return False
    return True


def resolution_kalshi_payout_complete_display(pos: Position) -> bool:
    """True when Kalshi is ``finalized`` / ``settled`` and we have an intrinsic mark (official yes/no).

    Does **not** require the dashboard contractual ``Ends`` clock to have passed: for many sports
    contracts the market resolves and finalizes while contractual ``close_time`` is still in the future,
    and we must still treat the leg as payout-complete for reconcile and UI.
    """
    if resolution_intrinsic_mark_dollars(pos) is None:
        return False
    st = (getattr(pos, "kalshi_market_status", None) or "").strip().lower()
    return st in _KALSHI_STATUSES_PAYOUT_COMPLETE


def closed_position_kalshi_outcome_pending(p: Position) -> bool:
    """Closed-row: Kalshi ``yes``/``no`` not yet stored (GET /markets backfill or settlement stamp pending)."""
    raw = getattr(p, "kalshi_market_result", None)
    if isinstance(raw, str) and raw.strip().lower() in ("yes", "no"):
        return False
    return True


def unrealized_pnl_from_executable_mark_dollars(
    *,
    mark_last: float,
    quantity: int,
    entry_cost: float,
    entry_price: float,
    fees_paid: float,
) -> float:
    """Mark-to-market P&L: ``mark × qty − open cash basis`` (mark is **best bid** on the held side)."""
    q = max(0, int(quantity or 0))
    ec = max(0.0, float(entry_cost or 0.0))
    ep = float(entry_price or 0.0)
    fp = max(0.0, float(fees_paid or 0.0))
    if ec <= 1e-12 and ep > 0 and q > 0:
        ec = ep * float(q)
    basis = open_cash_basis_dollars(ec, ep, q, fp)
    return float(mark_last) * float(q) - basis


def closed_leg_realized_pnl_kalshi_dollars(
    *,
    quantity_sold: int,
    exit_price_per_contract_gross: float,
    entry_cost_at_open: float,
    entry_price_at_open: float,
    quantity_at_open: int,
    fees_paid_roundtrip: float,
) -> float:
    """Kalshi trade-history style realized P&L for a **full** close.

    ``invested`` = contract notional at open (``entry_cost`` when it matches ``entry_price``×qty)
    plus **all** trading fees on the leg (buy + sell), same as :func:`open_cash_basis_dollars`.

    ``realized`` = ``quantity_sold × exit_price_per_contract_gross`` − that invested amount
    (gross exit notional vs cash in, matching e.g. 2×0.35 − (2×0.48 + 0.04 + 0.04) = −0.34).
    """
    qo = max(0, int(quantity_at_open or 0))
    qs = max(0, int(quantity_sold or 0))
    if qo <= 0 or qs <= 0:
        return 0.0
    invested = open_cash_basis_dollars(
        float(entry_cost_at_open or 0.0),
        float(entry_price_at_open or 0.0),
        qo,
        float(fees_paid_roundtrip or 0.0),
    )
    if qs < qo:
        # Partial: allocate invested linearly by share of contracts (same as average-cost exit).
        invested = invested * (float(qs) / float(qo))
    gross_exit = float(qs) * max(0.0, float(exit_price_per_contract_gross or 0.0))
    return gross_exit - invested


def infer_closed_contract_quantity(pos: Position) -> int:
    """Whole contracts for display when stored ``quantity`` is zero but cost/avg imply a lot size."""
    q = max(0, int(pos.quantity or 0))
    if q > 0:
        return q
    ec = float(pos.entry_cost or 0.0)
    ep = float(pos.entry_price or 0.0)
    if ec <= 1e-12 or ep <= 1e-12:
        return 0
    ratio = ec / ep
    if ratio <= 1e-12 or ratio > 500_000:
        return 0
    n = int(round(ratio))
    if abs(ratio - float(n)) <= 0.06 + 1e-6 and n >= 1:
        return n
    return max(0, int(math.floor(ratio + 1e-9)))


def get_open_position(
    db: Session,
    *,
    trade_mode: str,
    market_id: str,
    side: str,
) -> Position | None:
    """Match open row using trimmed market id and upper side (avoids duplicate rows from stray whitespace)."""
    mid = normalize_market_id(market_id)
    s = normalize_side(side)
    return (
        db.query(Position)
        .filter(
            Position.trade_mode == trade_mode,
            Position.status == "open",
            func.trim(Position.market_id) == mid,
            func.upper(Position.side) == s,
        )
        .order_by(Position.opened_at.asc(), Position.id.asc())
        .first()
    )


def dedupe_open_positions(db: Session, trade_mode: str) -> int:
    """Merge or delete duplicate open Position rows for the same normalized (market_id, side).

    Live: Kalshi holds one leg per key; extras are deleted after syncing identical qty/cost onto keeper.
    Paper: quantities and entry_cost are summed; entry_price recomputed.

    Returns number of rows deleted.
    """
    rows: List[Position] = (
        db.query(Position)
        .filter(Position.status == "open", Position.trade_mode == trade_mode)
        .order_by(Position.opened_at.asc(), Position.id.asc())
        .all()
    )
    groups: dict[Tuple[str, str], List[Position]] = defaultdict(list)
    for p in rows:
        side = normalize_side(p.side)
        if side not in ("YES", "NO"):
            continue
        groups[(normalize_market_id(p.market_id), side)].append(p)

    deleted = 0
    touched = False
    for _key, plist in groups.items():
        if len(plist) <= 1:
            p = plist[0]
            nm = normalize_market_id(p.market_id)
            if p.market_id != nm:
                p.market_id = nm
                touched = True
            continue

        keeper = plist[0]
        dupes = plist[1:]
        keeper.market_id = normalize_market_id(keeper.market_id)
        keeper.side = normalize_side(keeper.side)

        if trade_mode == "paper":
            total_q = sum(max(0, int(x.quantity or 0)) for x in plist)
            total_c = sum(float(x.entry_cost or 0.0) for x in plist)
            keeper.quantity = max(0, total_q)
            keeper.entry_cost = total_c
            keeper.entry_price = (total_c / total_q) if total_q > 0 else float(keeper.entry_price or 0.0)
            titles = [x.market_title for x in plist if (x.market_title or "").strip()]
            if titles:
                keeper.market_title = max(titles, key=len)
            last = plist[-1]
            keeper.current_price = float(last.current_price or keeper.current_price or 0.0)
            lb = getattr(last, "bid_price", None)
            keeper.bid_price = float(lb) if lb is not None else float(last.current_price or 0.0)
            le = getattr(last, "estimated_price", None)
            if le is not None:
                keeper.estimated_price = float(le)
            lk = getattr(last, "kalshi_market_status", None)
            keeper.kalshi_market_status = str(lk).strip().lower() if lk and str(lk).strip() else None
            lr = getattr(last, "kalshi_market_result", None)
            lr_s = str(lr).strip().lower() if lr is not None and str(lr).strip() else ""
            keeper.kalshi_market_result = lr_s if lr_s in ("yes", "no") else None
            keeper.unrealized_pnl = float(keeper.current_price or 0.0) * keeper.quantity - open_position_cash_basis_dollars(
                keeper
            )
        else:
            titles = [x.market_title for x in plist if (x.market_title or "").strip()]
            if titles:
                keeper.market_title = max(titles, key=len)

        for d in dupes:
            db.delete(d)
            deleted += 1
        touched = True

    if touched:
        db.commit()
    return deleted


def ensure_open_position_unique_index(engine) -> None:
    """SQLite: at most one open row per (trade_mode, trimmed market, side)."""
    from sqlalchemy import text

    stmt = text(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_positions_open_trade_market_side
        ON positions (trade_mode, trim(market_id), upper(side))
        WHERE status = 'open'
        """
    )
    with engine.connect() as conn:
        conn.execute(stmt)
        conn.commit()
