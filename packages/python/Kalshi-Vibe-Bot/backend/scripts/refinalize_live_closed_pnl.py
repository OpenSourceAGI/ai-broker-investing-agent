"""Recalculate closed **live** positions from Kalshi (settlements + GET /orders) and persist to SQLite.

Uses the updated IOC / NO-sell fill parsing so ``Position.realized_pnl``, exit marks, and linked
``Trade`` rows align with Kalshi. Portfolio totals on ``GET /portfolio`` sum ``Position.realized_pnl``
for closed rows — no separate aggregate table needs patching.

Usage (from ``backend/``)::

    python scripts/refinalize_live_closed_pnl.py
    python scripts/refinalize_live_closed_pnl.py --force-live   # when .env has TRADING_MODE=paper

Options::

    --force-live     Repair ``trade_mode=live`` rows using Kalshi keys even if TRADING_MODE is paper
    --max-pages N    Settlement pagination depth (default 40 × 250 rows)

Requires valid ``KALSHI_*`` credentials and network access.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Ensure imports resolve like ``python run.py``
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
os.chdir(_BACKEND_ROOT)
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import func

from src.clients.kalshi_client import KalshiClient
from src.config import settings
from src.database.models import Position, get_session_local
from src.reconcile.kalshi_closed_position_finalize import (
    finalize_live_closed_positions_from_kalshi,
    refresh_closed_live_position_economics_from_kalshi_orders,
)


def _sum_closed_realized(db, trade_mode: str) -> float:
    v = (
        db.query(func.coalesce(func.sum(Position.realized_pnl), 0.0))
        .filter(Position.trade_mode == trade_mode, Position.status == "closed")
        .scalar()
    )
    return float(v or 0.0)


async def _run(*, force_live: bool, settlement_max_pages: int) -> None:
    mode_env = (settings.trading_mode or "").strip().lower()
    if mode_env != "live" and not force_live:
        print(
            "TRADING_MODE is not live — refusing to call Kalshi for DB repair "
            "(pass --force-live to refresh trade_mode=live rows anyway).",
        )
        return

    client = KalshiClient(
        settings.kalshi_api_key,
        settings.kalshi_private_key_path,
        settings.kalshi_base_url,
    )
    client.invalidate_settlements_cache()
    settlement_rows = await client.get_settlements_paginated(
        page_limit=250,
        max_pages=max(1, min(100, settlement_max_pages)),
    )
    print(f"Fetched {len(settlement_rows)} Kalshi settlement row(s).")

    db = get_session_local()()
    try:
        before = _sum_closed_realized(db, "live")
        closed_live = (
            db.query(Position)
            .filter(Position.trade_mode == "live", Position.status == "closed")
            .all()
        )
        for pos in closed_live:
            pos.kalshi_closure_finalized = False
        db.commit()
        print(f"Reopened finalize for {len(closed_live)} closed live row(s). Sum realized_pnl before: {before:.4f}")

        rounds = 0
        patched_total = 0
        while True:
            n = await finalize_live_closed_positions_from_kalshi(
                db,
                trade_mode="live",
                kalshi_client=client,
                settlement_rows=settlement_rows,
            )
            db.commit()
            rounds += 1
            patched_total += n
            if n == 0:
                break
            if rounds > 80:
                print("Stopped after 80 rounds (safety cap); rerun if needed.")
                break

        basis_updates = 0
        for pos in (
            db.query(Position)
            .filter(Position.trade_mode == "live", Position.status == "closed")
            .order_by(Position.closed_at.asc())
            .all()
        ):
            if await refresh_closed_live_position_economics_from_kalshi_orders(
                db, pos, kalshi_client=client
            ):
                basis_updates += 1
        db.commit()
        print(f"Refreshed entry/exit/fees/P&L from paired buy+sell GET orders: {basis_updates} row(s).")

        after = _sum_closed_realized(db, "live")
        unfinalized = (
            db.query(func.count(Position.id))
            .filter(
                Position.trade_mode == "live",
                Position.status == "closed",
                Position.kalshi_closure_finalized.is_(False),
            )
            .scalar()
        )
        print(
            f"Finalize rounds={rounds}, rows patched (last passes): {patched_total}; "
            f"sum realized_pnl after: {after:.4f} (delta {after - before:+.4f})",
        )
        if unfinalized:
            print(
                f"Note: {int(unfinalized)} closed live row(s) still have kalshi_closure_finalized=false "
                "(e.g. settlement without matching API row, or missing exit order id).",
            )
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Recalculate closed live P&L from Kalshi.")
    ap.add_argument(
        "--force-live",
        action="store_true",
        help="Run even when TRADING_MODE is not live (still updates trade_mode=live positions only).",
    )
    ap.add_argument(
        "--max-pages",
        type=int,
        default=40,
        help="Max settlement API pages (250 rows each). Default 40.",
    )
    args = ap.parse_args()
    asyncio.run(_run(force_live=args.force_live, settlement_max_pages=args.max_pages))


if __name__ == "__main__":
    main()
