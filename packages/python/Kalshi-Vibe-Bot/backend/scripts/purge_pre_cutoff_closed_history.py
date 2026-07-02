"""One-time purge: closed positions and related history before 11:00 AM MDT on 2026-05-17.

Deletes:
- ``positions`` rows with ``status='closed'`` opened before the cutoff (bought prior to 11am MDT)
- ``trades`` for those (market_id, trade_mode) legs
- ``decision_logs`` for those markets with ``timestamp`` before cutoff, plus entry logs referenced by deleted positions
- ``kalshi_reconcile_cursor`` rows for purged market tickers
- ``portfolio_snapshots`` with ``timestamp`` before cutoff

Does **not** delete open positions, bot/tuning/vault state, or decision logs for markets with no purged closed row.

Usage (from ``backend/``, bot stopped recommended)::

    python scripts/purge_pre_cutoff_closed_history.py --dry-run
    python scripts/purge_pre_cutoff_closed_history.py --execute

"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Set, Tuple

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
os.chdir(_BACKEND_ROOT)
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import and_, func, or_

from src.database.models import (
    DecisionLog,
    KalshiReconcileCursor,
    PortfolioSnapshot,
    Position,
    Trade,
    get_session_local,
)
from src.reconcile.open_positions import normalize_market_id as norm_mid

# 11:00 AM MDT (UTC−6) on 2026-05-17 → 17:00 UTC
CUTOFF_UTC = datetime(2026, 5, 17, 17, 0, 0, tzinfo=timezone.utc)


def _closed_positions_before_cutoff(db) -> List[Position]:
    """Closed legs opened before cutoff, or closed before cutoff when ``opened_at`` is missing."""
    return (
        db.query(Position)
        .filter(
            Position.status == "closed",
            or_(
                and_(Position.opened_at.isnot(None), Position.opened_at < CUTOFF_UTC),
                and_(
                    Position.opened_at.is_(None),
                    Position.closed_at.isnot(None),
                    Position.closed_at < CUTOFF_UTC,
                ),
            ),
        )
        .all()
    )


def _collect_purge_sets(db) -> Tuple[List[Position], Set[str], Set[str], Set[str]]:
    positions = _closed_positions_before_cutoff(db)
    position_ids = {str(p.id) for p in positions}
    market_keys: Set[str] = set()
    entry_log_ids: Set[str] = set()
    for p in positions:
        mid = norm_mid(p.market_id or "")
        mode = (p.trade_mode or "live").strip().lower()
        if mid:
            market_keys.add(f"{mode}:{mid.upper()}")
        eid = str(getattr(p, "entry_decision_log_id", None) or "").strip()
        if eid:
            entry_log_ids.add(eid)
    return positions, position_ids, market_keys, entry_log_ids


def _market_mode_pairs(market_keys: Set[str]) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    for k in market_keys:
        mode, _, mid = k.partition(":")
        if mid:
            out.append((mode, mid))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="Print counts only; no deletes")
    group.add_argument("--execute", action="store_true", help="Apply deletes")
    args = parser.parse_args()
    execute = bool(args.execute)

    db = get_session_local()()
    try:
        positions, position_ids, market_keys, entry_log_ids = _collect_purge_sets(db)
        pairs = _market_mode_pairs(market_keys)

        n_trades = 0
        n_logs = 0
        n_cursors = 0
        if pairs:
            for mode, mid in pairs:
                n_trades += (
                    db.query(func.count(Trade.id))
                    .filter(Trade.trade_mode == mode, func.upper(Trade.market_id) == mid)
                    .scalar()
                    or 0
                )
                q_logs = db.query(func.count(DecisionLog.id)).filter(
                    DecisionLog.trade_mode == mode,
                    func.upper(DecisionLog.market_id) == mid,
                    DecisionLog.timestamp < CUTOFF_UTC,
                )
                n_logs += int(q_logs.scalar() or 0)
            for mode, mid in pairs:
                n_cursors += (
                    db.query(func.count(KalshiReconcileCursor.id))
                    .filter(
                        KalshiReconcileCursor.trade_mode == mode,
                        KalshiReconcileCursor.market_id_norm == mid,
                    )
                    .scalar()
                    or 0
                )

        n_entry_logs_extra = 0
        if entry_log_ids:
            n_entry_logs_extra = (
                db.query(func.count(DecisionLog.id))
                .filter(DecisionLog.id.in_(entry_log_ids))
                .scalar()
                or 0
            )

        n_snapshots = (
            db.query(func.count(PortfolioSnapshot.id))
            .filter(PortfolioSnapshot.timestamp < CUTOFF_UTC)
            .scalar()
            or 0
        )

        print(f"Cutoff (UTC): {CUTOFF_UTC.isoformat()}  (= 11:00 AM MDT 2026-05-17)")
        print(f"Closed positions to delete (opened_at < cutoff): {len(positions)}")
        print(f"Distinct market legs: {len(pairs)}")
        print(f"Trades (all actions on those legs): {n_trades}")
        print(f"Decision logs (market + timestamp < cutoff): {n_logs}")
        print(f"Entry decision logs (by id, may overlap): {n_entry_logs_extra}")
        print(f"Kalshi reconcile cursors: {n_cursors}")
        print(f"Portfolio snapshots (timestamp < cutoff): {n_snapshots}")

        if not execute:
            print("\nDry run — no changes. Re-run with --execute to apply.")
            return

        if not positions and n_snapshots == 0:
            print("\nNothing to delete.")
            return

        # Trades
        for mode, mid in pairs:
            db.query(Trade).filter(
                Trade.trade_mode == mode, func.upper(Trade.market_id) == mid
            ).delete(synchronize_session=False)

        # Decision logs (time-bounded per market + entry ids)
        for mode, mid in pairs:
            db.query(DecisionLog).filter(
                DecisionLog.trade_mode == mode,
                func.upper(DecisionLog.market_id) == mid,
                DecisionLog.timestamp < CUTOFF_UTC,
            ).delete(synchronize_session=False)
        if entry_log_ids:
            db.query(DecisionLog).filter(DecisionLog.id.in_(entry_log_ids)).delete(
                synchronize_session=False
            )

        # Cursors
        for mode, mid in pairs:
            db.query(KalshiReconcileCursor).filter(
                KalshiReconcileCursor.trade_mode == mode,
                KalshiReconcileCursor.market_id_norm == mid,
            ).delete(synchronize_session=False)

        # Positions
        if position_ids:
            db.query(Position).filter(Position.id.in_(position_ids)).delete(
                synchronize_session=False
            )

        db.query(PortfolioSnapshot).filter(PortfolioSnapshot.timestamp < CUTOFF_UTC).delete(
            synchronize_session=False
        )

        db.commit()
        print("\nPurge committed.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
