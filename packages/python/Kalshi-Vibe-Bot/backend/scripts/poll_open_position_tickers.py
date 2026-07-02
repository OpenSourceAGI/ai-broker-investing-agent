"""One-off: fetch Kalshi GET /markets for every open position ticker; print scenario summary.

Run from repo root or backend/:
  set PYTHONPATH=backend   (Windows: $env:PYTHONPATH="path\\to\\backend")
  python backend/scripts/poll_open_position_tickers.py
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# backend/ as cwd when PYTHONPATH includes parent of `src`
_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from src.clients.kalshi_client import (  # noqa: E402
    KalshiClient,
    open_position_estimated_mark_dollars,
    open_position_mark_dollars,
)
from src.config import settings  # noqa: E402
from src.reconcile.open_positions import normalize_market_id  # noqa: E402


def _load_open_rows(db_path: Path) -> List[Dict[str, Any]]:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """
        SELECT id, trade_mode, market_id, side, quantity, entry_price,
               bid_price, estimated_price, current_price, kalshi_market_status
        FROM positions
        WHERE status = 'open'
        ORDER BY trade_mode, market_id, side
        """
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


def _scenario(
    *,
    side: str,
    yes_bid: float,
    yes_ask: float,
    yes_last: Optional[float],
    has_last: bool,
    mark: float,
    est: Optional[float],
) -> str:
    su = (side or "").upper()
    tags: List[str] = []
    if yes_bid <= 0 and yes_ask > 0:
        tags.append("one-sided-book")
    if yes_bid > 0 and yes_ask > 0:
        tags.append("two-sided-book")
    if has_last and yes_last is not None:
        tags.append("has-last-trade")
    else:
        tags.append("no-last-trade")
    if est is not None and yes_ask > 0 and abs(float(est) - float(yes_ask)) > 0.05:
        tags.append("est-ne-ask")
    if mark <= 0 and yes_ask > 0.5:
        tags.append("zero-bid-high-ask")
    if su == "NO" and est is not None:
        tags.append("NO-side")
    return ",".join(tags) if tags else "default"


async def _poll_one(
    client: KalshiClient, row: Dict[str, Any]
) -> Dict[str, Any]:
    mid = normalize_market_id(str(row.get("market_id") or ""))
    side = str(row.get("side") or "YES")
    out: Dict[str, Any] = {
        "id": (str(row["id"])[:8] + "..."),
        "trade_mode": row["trade_mode"],
        "market_id": mid,
        "side": side,
        "qty": row["quantity"],
        "db_est": row.get("estimated_price"),
        "db_bid": row.get("bid_price"),
        "db_cur": row.get("current_price"),
        "kalshi_status": None,
        "error": None,
        "yes_bid": None,
        "yes_ask": None,
        "yes_last": None,
        "has_last_trade": None,
        "mark_open_pos": None,
        "est_open_pos": None,
        "scenario": None,
    }
    try:
        m = await client.get_market(mid)
        if not m:
            raw = str(row.get("market_id") or "").strip()
            if raw and raw != mid:
                m = await client.get_market(raw)
        if not m:
            out["error"] = "get_market returned None"
            return out
        ob = await client.get_market_orderbook_fp(mid)
        yes_bid = float(m.get("yes_bid") or 0.0)
        yes_ask = float(m.get("yes_ask") or 0.0)
        yes_last = m.get("yes_last")
        yl = float(yes_last) if yes_last is not None else None
        has_last = bool(m.get("has_last_trade"))
        mark = open_position_mark_dollars(m, side, ob)
        est = open_position_estimated_mark_dollars(m, side)
        out["kalshi_status"] = m.get("kalshi_api_status")
        out["yes_bid"] = yes_bid
        out["yes_ask"] = yes_ask
        out["yes_last"] = yl
        out["has_last_trade"] = has_last
        out["mark_open_pos"] = mark
        out["est_open_pos"] = est
        out["scenario"] = _scenario(
            side=side,
            yes_bid=yes_bid,
            yes_ask=yes_ask,
            yes_last=yl,
            has_last=has_last,
            mark=mark,
            est=est,
        )
    except Exception as e:
        out["error"] = str(e)[:200]
    return out


async def main() -> None:
    key = (getattr(settings, "kalshi_api_key", None) or "").strip()
    if not key:
        print("KALSHI_API_KEY missing — cannot poll Kalshi.")
        sys.exit(1)

    db_path = _BACKEND / "trading_bot.db"
    rows = _load_open_rows(db_path)
    if not rows:
        print("No open positions in trading_bot.db")
        return

    client = KalshiClient(
        settings.kalshi_api_key,
        settings.kalshi_private_key_path,
        settings.kalshi_base_url,
    )
    try:
        # Parallel with small semaphore to respect rate limits
        sem = asyncio.Semaphore(6)

        async def bounded(r: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                return await _poll_one(client, r)

        results = await asyncio.gather(*[bounded(r) for r in rows])
    finally:
        closer = getattr(client, "aclose", None)
        if closer:
            await closer()

    # Compact table
    print(f"Open positions: {len(rows)}  (db={db_path.name})\n")
    for r in results:
        line = json.dumps(r, default=str)
        print(line)

    # Scenario rollup
    from collections import Counter

    c = Counter(str(x.get("scenario") or "n/a") for x in results)
    errs = [x for x in results if x.get("error")]
    print("\n--- scenario tags (frequency) ---")
    for k, v in c.most_common():
        print(f"  {v}x  {k}")
    drift = 0
    for x in results:
        if x.get("error"):
            continue
        dbe = x.get("db_est")
        est = x.get("est_open_pos")
        if dbe is None or est is None:
            continue
        if abs(float(dbe) - float(est)) > 0.02:
            drift += 1
    print(f"\n--- db estimated_price vs live est_open_pos (|diff|>0.02) ---")
    print(f"  {drift} / {len(results) - len(errs)} rows (excl. errors)")
    if errs:
        print(f"\n--- errors ({len(errs)}) ---")
        for x in errs:
            print(x["market_id"], x.get("error"))


if __name__ == "__main__":
    asyncio.run(main())
