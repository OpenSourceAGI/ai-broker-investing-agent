"""Refresh **open** live positions from Kalshi: portfolio snapshot + buy-order entry + unrealized P&L.

1. ``GET /portfolio/positions`` → existing open rows (qty, cost, avg, fees).
2. Import Kalshi-only open legs missing locally.
3. For each open live row: ``GET /portfolio/orders/{{buy}}`` entry refinement + bid-based mark/unrealized P&L (strict observable bids + orderbook when snapshot bid is 0).

Does **not** run settlement closes, flat-row closed deltas, or closure finalization (use the full
UI reconcile or ``refinalize_live_closed_pnl.py`` for closed legs).

Usage (from ``backend/``)::

    python scripts/refresh_open_live_positions_from_kalshi.py
    python scripts/refresh_open_live_positions_from_kalshi.py --force-live

``--force-live`` allows calling Kalshi when ``TRADING_MODE`` is not ``live`` (still updates
``trade_mode=live`` rows only).

Requires valid ``KALSHI_*`` credentials in ``.env`` and network access.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
os.chdir(_BACKEND_ROOT)
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from sqlalchemy import func

from src.clients.kalshi_client import KalshiClient
from src.config import settings
from src.database.models import Position, get_session_local
from src.reconcile.kalshi_positions import (
    import_missing_open_positions_from_kalshi,
    refresh_open_live_positions_from_kalshi_orders,
    sync_open_positions_from_kalshi_portfolio_rows,
)


def _sum_open_unrealized(db, trade_mode: str) -> float:
    v = (
        db.query(func.coalesce(func.sum(Position.unrealized_pnl), 0.0))
        .filter(Position.trade_mode == trade_mode, Position.status == "open")
        .scalar()
    )
    return float(v or 0.0)


async def _run(*, force_live: bool) -> None:
    mode_env = (settings.trading_mode or "").strip().lower()
    if mode_env != "live" and not force_live:
        print(
            "TRADING_MODE is not live — refusing to call Kalshi for open-position refresh "
            "(pass --force-live to refresh trade_mode=live rows anyway).",
        )
        return

    client = KalshiClient(
        settings.kalshi_api_key,
        settings.kalshi_private_key_path,
        settings.kalshi_base_url,
    )
    db = get_session_local()()
    try:
        before = _sum_open_unrealized(db, "live")
        api_rows = list(await client.get_positions() or [])
        n_open = sync_open_positions_from_kalshi_portfolio_rows(
            db, trade_mode="live", api_rows=api_rows
        )
        db.commit()
        n_imp = await import_missing_open_positions_from_kalshi(
            db,
            trade_mode="live",
            api_rows=api_rows,
            kalshi_client=client,
        )
        n_ent, n_un = await refresh_open_live_positions_from_kalshi_orders(
            db, trade_mode="live", kalshi_client=client
        )
        db.commit()
        after = _sum_open_unrealized(db, "live")
        print(
            f"Open refresh: portfolio_field_updates={n_open} imported={n_imp} "
            f"entry_order_refreshes={n_ent} unrealized_refreshes={n_un}",
        )
        print(f"Sum open unrealized_pnl: before={before:.4f} after={after:.4f} (delta {after - before:+.4f})")
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Refresh open live positions from Kalshi API.")
    ap.add_argument(
        "--force-live",
        action="store_true",
        help="Run even when TRADING_MODE is not live (still updates trade_mode=live rows only).",
    )
    args = ap.parse_args()
    asyncio.run(_run(force_live=args.force_live))


if __name__ == "__main__":
    main()
