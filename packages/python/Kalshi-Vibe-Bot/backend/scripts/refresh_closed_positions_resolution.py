"""Backfill ``kalshi_market_result`` / ``kalshi_market_status`` on closed Position rows from Kalshi.

Calls ``GET /markets/{{ticker}}`` for each recent closed row (same normalization as the open-leg monitor).

Usage (from ``backend/``)::

    python scripts/refresh_closed_positions_resolution.py
    python scripts/refresh_closed_positions_resolution.py --limit 100 --trade-mode paper
    python scripts/refresh_closed_positions_resolution.py --missing-only

``--missing-only`` matches the bot's periodic job (only rows without a stored yes/no). Default is a full recent window.

Requires ``KALSHI_*`` credentials and network access. Uses ``TRADING_MODE`` rows unless ``--trade-mode`` overrides.
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

from src.clients.kalshi_client import KalshiClient
from src.config import settings
from src.database.models import get_session_local
from src.reconcile.kalshi_positions import refresh_closed_positions_resolution_from_kalshi


async def _run(*, trade_mode: str, limit: int, only_missing_result: bool) -> None:
    mode = (trade_mode or settings.trading_mode or "paper").strip().lower()
    if mode not in ("paper", "live"):
        mode = "paper"

    client = KalshiClient(
        settings.kalshi_api_key,
        settings.kalshi_private_key_path,
        settings.kalshi_base_url,
    )
    db = get_session_local()()
    try:
        out = await refresh_closed_positions_resolution_from_kalshi(
            db,
            trade_mode=mode,
            kalshi_client=client,
            limit=limit,
            only_missing_result=only_missing_result,
        )
        print(
            f"trade_mode={mode} "
            f"examined={out['examined']} updated={out['updated']} "
            f"unchanged={out['unchanged']} market_fetch_failed={out['market_fetch_failed']}",
        )
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Refresh Kalshi outcome fields on closed position rows.")
    ap.add_argument(
        "--trade-mode",
        choices=("paper", "live"),
        default=None,
        help="Which Position.trade_mode rows to refresh (default: env TRADING_MODE).",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Most recent closed rows by closed_at (default 50, max 500).",
    )
    ap.add_argument(
        "--missing-only",
        action="store_true",
        help="Only rows without a canonical yes/no outcome (same filter as the bot auto-refresh).",
    )
    args = ap.parse_args()
    tm = args.trade_mode or settings.trading_mode
    asyncio.run(
        _run(
            trade_mode=str(tm),
            limit=max(1, min(int(args.limit), 500)),
            only_missing_result=bool(args.missing_only),
        )
    )


if __name__ == "__main__":
    main()
