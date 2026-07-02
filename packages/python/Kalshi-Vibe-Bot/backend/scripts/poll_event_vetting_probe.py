"""One-off: fetch event + markets from Kalshi and run ``is_tradeable_market`` with current Settings.

Usage (from repo): python -m scripts.poll_event_vetting_probe KXBTCD-26MAY1011
"""

from __future__ import annotations

import asyncio
import sys

from src.bot.loop import is_tradeable_market
from src.clients.kalshi_client import KalshiClient
from src.config import settings


async def main(event_ticker: str) -> None:
    et = (event_ticker or "").strip().upper()
    kc = KalshiClient(
        api_key=settings.kalshi_api_key,
        private_key_path=settings.kalshi_private_key_path,
        base_url=settings.kalshi_base_url,
    )
    try:
        r = await kc._http_get_signed(f"/trade-api/v2/events/{et}", timeout=20.0)
        print(f"GET /trade-api/v2/events/{et} -> HTTP {r.status_code}")
        raw_list: list[dict] = []
        if r.status_code != 200:
            print((r.text or "")[:1200])
            return

        body = r.json() or {}
        ev = body.get("event") or body
        mk = ev.get("markets")
        if mk is None:
            mk = body.get("markets")

        if isinstance(mk, list) and mk:
            if isinstance(mk[0], dict):
                raw_list = list(mk)
            elif isinstance(mk[0], str):
                for tid in mk:
                    r_m = await kc._http_get_signed(f"/trade-api/v2/markets/{tid}", timeout=15.0)
                    if r_m.status_code == 200:
                        wire = (r_m.json() or {}).get("market") or {}
                        if wire:
                            raw_list.append(wire)

        if not raw_list:
            # Fallback: paginate open markets and filter by event_ticker
            cursor = None
            for _page in range(15):
                params: dict = {
                    "limit": "1000",
                    "status": "open",
                    "mve_filter": "exclude",
                }
                if cursor:
                    params["cursor"] = cursor
                r2 = await kc._http_get_signed("/trade-api/v2/markets", params=params, timeout=60.0)
                if r2.status_code != 200:
                    print("GET /markets fallback failed", r2.status_code, (r2.text or "")[:400])
                    break
                data = r2.json() or {}
                rows = data.get("markets") or []
                for raw in rows:
                    et_row = str(raw.get("event_ticker") or "").strip().upper()
                    if et_row == et:
                        raw_list.append(raw)
                cursor = data.get("cursor")
                if not cursor:
                    break

        print(f"Markets under event: {len(raw_list)}")
        print(
            "--- vetting:",
            f"bot_max_hours={settings.bot_max_hours}",
            f"bot_min_volume={settings.bot_min_volume}",
            f"bot_max_spread={settings.bot_max_spread}",
            f"bot_min_top_size={settings.bot_min_top_size}",
            f"local_min_residual_payoff={settings.local_min_residual_payoff}",
        )
        n_pass = 0
        for raw in raw_list:
            n = kc._normalize_market(raw)
            ok, reason = is_tradeable_market(
                n,
                max_hours=settings.bot_max_hours,
                min_volume=settings.bot_min_volume,
                max_spread=settings.bot_max_spread,
                min_top_size=settings.bot_min_top_size,
                min_residual_payoff=settings.local_min_residual_payoff,
            )
            tid = str(n.get("id") or raw.get("ticker") or "?")
            if ok:
                n_pass += 1
                print(f"PASS {tid} | vh={n.get('vetting_horizon_time')} vol={n.get('volume')}")
            else:
                print(f"FAIL {tid} | {reason} | vh={n.get('vetting_horizon_time')} vol={n.get('volume')}")
        print(f"SUMMARY: {n_pass}/{len(raw_list)} pass is_tradeable_market")
    finally:
        await kc.aclose()


if __name__ == "__main__":
    ev_arg = sys.argv[1] if len(sys.argv) > 1 else "KXBTCD-26MAY1011"
    asyncio.run(main(ev_arg))
