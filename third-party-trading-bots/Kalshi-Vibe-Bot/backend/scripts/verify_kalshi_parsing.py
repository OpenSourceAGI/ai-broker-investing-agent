#!/usr/bin/env python3
"""Live Kalshi smoke test: auth, positions, orders, orderbook, PnL helpers (uses backend/.env).

Run from repo:  python scripts/verify_kalshi_parsing.py
Run from backend:  python scripts/verify_kalshi_parsing.py
"""
from __future__ import annotations

import asyncio
import os
import sys

# Allow `python scripts/verify_kalshi_parsing.py` from backend/ (parent of scripts/)
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)


async def main() -> int:
    from src.config import settings
    from src.clients.kalshi_client import (
        KalshiClient,
        best_orderbook_native_bid_dollars_string,
        kalshi_order_avg_contract_price_and_proceeds,
        kalshi_order_average_fill_price_dollars,
        kalshi_order_filled_contracts,
        kalshi_order_fees_dollars,
        open_position_mark_dollars,
    )
    from src.reconcile.open_positions import closed_leg_realized_pnl_kalshi_dollars

    key = (settings.kalshi_api_key or "").strip()
    pem = (settings.kalshi_private_key_path or "").strip()
    if not key or not pem:
        print("SKIP: KALSHI_API_KEY or KALSHI_PRIVATE_KEY_PATH missing in backend/.env")
        return 2
    if not os.path.isfile(pem):
        print(f"SKIP: private key file not found: {pem}")
        return 2

    client = KalshiClient(key, pem, settings.kalshi_base_url)
    if not client._has_credentials():
        print("SKIP: Kalshi client has no credentials (key or PEM load failed)")
        return 2

    print("GET /portfolio/positions (first page)...")
    rows = await client.get_positions(max_pages=1, page_limit=20)
    print(f"  rows={len(rows)}")
    ticker = None
    if rows:
        r0 = rows[0]
        ticker = (r0.get("ticker") or r0.get("market_ticker") or "").strip()
        print(f"  sample ticker={ticker!r}")

    print("GET /portfolio/orders (single page, limit 40)...")
    orders = await client.list_orders(page_limit=40, max_pages=1)
    print(f"  orders_this_page={len(orders)}")
    sell_exec = None
    for o in orders:
        if (o.get("action") or "").lower() == "sell" and (o.get("status") or "").lower() == "executed":
            sell_exec = o
            break
    if sell_exec:
        oid = sell_exec.get("order_id") or sell_exec.get("id")
        filled = kalshi_order_filled_contracts(sell_exec)
        px, proceeds = kalshi_order_avg_contract_price_and_proceeds(
            sell_exec, filled=max(filled, 1e-6), fallback_per_contract_dollars=0.01
        )
        vwap = kalshi_order_average_fill_price_dollars(sell_exec)
        fees = kalshi_order_fees_dollars(sell_exec)
        print(f"  sample SELL executed order_id={oid} filled={filled}")
        print(f"    avg_exit_px={px:.4f} proceeds(net)={proceeds:.4f} api_vwap={vwap:.4f} fees={fees:.4f}")
        if oid:
            merged = await client.refresh_order_fill_snapshot(dict(sell_exec))
            px2, _ = kalshi_order_avg_contract_price_and_proceeds(
                merged, filled=max(kalshi_order_filled_contracts(merged), 1e-6), fallback_per_contract_dollars=0.01
            )
            print(f"    after refresh_order_fill_snapshot avg_exit_px={px2:.4f}")
    else:
        print("  (no executed sell in first page — helper checks skipped for live order)")

    if ticker:
        print("GET /markets/{ticker}/orderbook depth=3 ...")
        ob = await client.get_market_orderbook_fp(ticker, depth=3)
        if ob:
            yb = best_orderbook_native_bid_dollars_string(ob, "YES")
            nb = best_orderbook_native_bid_dollars_string(ob, "NO")
            print(f"  orderbook_fp best YES bid ds={yb!r} NO bid ds={nb!r}")
        else:
            print("  (no orderbook payload — market may be settled)")
        print(f"GET /markets/{{ticker}} + orderbook (strict bid marks) ...")
        mk, ob = await asyncio.gather(
            client.get_market(ticker),
            client.get_market_orderbook_fp(ticker, depth=8),
        )
        if mk:
            for side in ("YES", "NO"):
                mp = open_position_mark_dollars(mk, side)
                if mp <= 0 and ob:
                    mp = open_position_mark_dollars(mk, side, ob)
                print(f"  open_position_mark_dollars({side})={mp:.4f}")
        else:
            print("  (no market payload)")

    # Synthetic divergence case (no network): ensures bundled helpers import
    fake = {
        "side": "yes",
        "action": "sell",
        "fill_count_fp": "2",
        "taker_fill_cost_dollars": "-1.26",
        "taker_fees_dollars": "0.04",
        "average_fill_price_dollars": "0.3500",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds(fake, filled=2.0, fallback_per_contract_dollars=0.5)
    assert abs(eff - 0.35) < 1e-6 and abs(net - 0.66) < 1e-6, (eff, net)
    pnl = closed_leg_realized_pnl_kalshi_dollars(
        quantity_sold=2,
        exit_price_per_contract_gross=0.35,
        entry_cost_at_open=0.96,
        entry_price_at_open=0.48,
        quantity_at_open=2,
        fees_paid_roundtrip=0.08,
    )
    assert abs(pnl - (-0.34)) < 1e-6, pnl
    print("Synthetic sell parse + closed_leg PnL: OK")

    print("OK: Kalshi live reads and parsing helpers succeeded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
