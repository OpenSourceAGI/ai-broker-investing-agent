"""Manual and automated trade persistence; live buys use IOC limits (see ``kalshi_client``)."""

import math
import uuid
from src.util.datetimes import utc_iso_z, utc_now

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.broadcast import broadcast_update
from src.app_state import app_state
from src.clients.kalshi_client import buy_side_liquidity_skip_summary
from src.config import settings
from src.database.models import Position, Trade, get_db, get_paper_cash_balance
from src.logger import logger
from src.reconcile.open_positions import get_open_position, normalize_market_id

router = APIRouter(tags=["trades"])


@router.post("/trade")
async def place_trade(
    market_id: str,
    side: str,
    quantity: int,
    limit_price: float,
    db: Session = Depends(get_db),
):
    kc = app_state.kalshi_client
    if kc is None:
        raise HTTPException(status_code=503, detail="Kalshi client not ready")
    try:
        side_up = side.upper()
        if side_up not in ("YES", "NO"):
            raise HTTPException(status_code=400, detail="side must be YES or NO")

        raw_mid = (market_id or "").strip()
        mid = normalize_market_id(raw_mid)
        m = await kc.get_market(raw_mid)
        if not m and mid and mid != raw_mid:
            m = await kc.get_market(mid)
        if not m:
            raise HTTPException(status_code=404, detail="Market not found")

        contract_title = (m.get("title") or "").strip() or (raw_mid or mid)
        subtitle = (m.get("subtitle") or "").strip()
        title = contract_title
        try:
            et = (m.get("event_ticker") or "").strip()
            if et:
                ev_title = (await kc.get_event_title(et)) or ""
                if ev_title:
                    tail = (subtitle or contract_title).strip()
                    title = f"{ev_title} — {tail}" if tail else ev_title
        except Exception:
            pass
        max_spread = float(getattr(settings, "bot_max_spread", 0.15))
        min_top = float(getattr(settings, "bot_min_top_size", 1.0))
        liq = buy_side_liquidity_skip_summary(
            m, side_up, max_spread=max_spread, min_top_size=min_top,
        )
        if liq:
            detail = liq.replace("Skipped — ", "", 1).strip()
            raise HTTPException(status_code=400, detail=f"Untradeable book: {detail}")

        buy_fees = 0.0
        if settings.trading_mode == "live":
            from src.clients.kalshi_client import (
                executable_buy_best_ask_dollars,
                kalshi_order_avg_contract_price_and_cost,
                kalshi_order_fees_dollars,
                kalshi_order_filled_contracts,
                live_ioc_buy_cap_dollars,
            )

            ask_px = executable_buy_best_ask_dollars(m, side_up)
            book_cap = live_ioc_buy_cap_dollars(m, side_up)
            cap = float(limit_price)
            if ask_px is None or book_cap is None:
                raise HTTPException(status_code=400, detail="No usable ask for IOC buy")
            gross = 1.0 - float(ask_px)
            if gross <= 1e-9:
                raise HTTPException(
                    status_code=400,
                    detail="Buy ask at or above $1 (no gross upside)",
                )
            min_res = float(getattr(settings, "local_min_residual_payoff", 0.0))
            if min_res > 1e-12 and gross + 1e-12 < min_res:
                raise HTTPException(
                    status_code=400,
                    detail=f"Gross upside ${gross:.2f}/contract below floor ({min_res:.2f})",
                )
            if cap + 1e-9 < ask_px:
                raise HTTPException(
                    status_code=400,
                    detail=f"limit_price ({cap:.4f}) is below ask ({ask_px:.4f}); IOC cannot fill without resting",
                )
            ioc_limit = min(cap, book_cap)
            if ioc_limit + 1e-9 < ask_px:
                raise HTTPException(status_code=400, detail="Effective IOC limit below ask")

            # Place the order using the raw market ticker when possible (some valid tickers can be mis-normalized).
            result = await kc.place_buy_ioc_limit(raw_mid or mid, side_up, quantity, ioc_limit)
            if result.get("error"):
                raise HTTPException(status_code=502, detail=result["error"])
            filled = kalshi_order_filled_contracts(result)
            qty_int = max(0, int(math.floor(float(filled) + 1e-9)))
            if qty_int < 1:
                raise HTTPException(
                    status_code=400,
                    detail="IOC buy did not fill any whole contracts",
                )
            avg_px, fill_cost = kalshi_order_avg_contract_price_and_cost(
                result,
                filled=filled,
                fallback_per_contract_dollars=float(ioc_limit),
            )
            scale = float(qty_int) / float(filled) if filled > 1e-9 else 1.0
            buy_fees = float(kalshi_order_fees_dollars(result)) * scale
            order_id = result.get("order_id") or result.get("client_order_id") or str(uuid.uuid4())
            trade = Trade(
                id=order_id,
                market_id=mid,
                market_title=title,
                action="buy",
                side=side_up,
                quantity=qty_int,
                price=avg_px,
                total_cost=fill_cost,
                trade_mode=settings.trading_mode,
            )
        else:
            cash = get_paper_cash_balance(db, settings.paper_starting_balance)
            if (quantity * limit_price) > cash:
                raise HTTPException(status_code=400, detail="Insufficient paper cash for trade")
            order_id = str(uuid.uuid4())
            logger.info("Paper trade: %s %s x%d @ %.3f", side, mid, quantity, limit_price)
            trade = Trade(
                id=order_id,
                market_id=mid,
                market_title=title,
                action="buy",
                side=side_up,
                quantity=quantity,
                price=limit_price,
                total_cost=quantity * limit_price,
                trade_mode=settings.trading_mode,
            )

        db.add(trade)

        existing = get_open_position(
            db,
            trade_mode=settings.trading_mode,
            market_id=mid,
            side=side_up,
        )
        _et_manual = (m.get("event_ticker") or "").strip() or None
        if not existing:
            db.add(Position(
                id=str(uuid.uuid4()),
                market_id=mid,
                market_title=title,
                event_ticker=_et_manual,
                side=side_up,
                quantity=trade.quantity,
                entry_price=trade.price,
                entry_cost=trade.total_cost,
                current_price=trade.price,
                fees_paid=float(buy_fees),
                status="open",
                trade_mode=settings.trading_mode,
            ))
        else:
            existing.quantity += trade.quantity
            existing.entry_cost += trade.total_cost
            if settings.trading_mode == "live":
                existing.fees_paid = float(getattr(existing, "fees_paid", 0) or 0) + buy_fees
            if existing.quantity > 0:
                existing.entry_price = existing.entry_cost / existing.quantity

        db.commit()
        await broadcast_update({
            "type": "trade_placed",
            "data": {"market_id": mid, "side": side, "quantity": trade.quantity, "price": trade.price},
        })
        return {"success": True, "order_id": trade.id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Trade error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/performance")
async def get_performance_stats(db: Session = Depends(get_db)):
    try:
        trades = (
            db.query(Trade)
            .filter(Trade.trade_mode == settings.trading_mode)
            .order_by(Trade.timestamp)
            .all()
        )
        sells = [t for t in trades if getattr(t, "action", "buy") == "sell"]
        buys = [t for t in trades if getattr(t, "action", "buy") == "buy"]

        ledger_sell_rows = len(sells)

        # Realized P&L / win rate must match **closed positions** (Kalshi-aligned in live), not raw sell
        # ledger rows — partial exits create multiple sells per position and Trade.realized_pnl can be stale.
        closed_positions = (
            db.query(Position)
            .filter(
                Position.status == "closed",
                Position.trade_mode == settings.trading_mode,
            )
            .all()
        )
        closed_n = len(closed_positions)

        def _rp(p: Position) -> float:
            try:
                return float(p.realized_pnl or 0.0)
            except Exception:
                return 0.0

        total_realized = sum(_rp(p) for p in closed_positions)
        total_gained = sum(max(0.0, _rp(p)) for p in closed_positions)
        total_lost = sum(_rp(p) for p in closed_positions if _rp(p) <= 0.0)
        wins = sum(1 for p in closed_positions if _rp(p) > 0)
        losses = sum(1 for p in closed_positions if _rp(p) < 0)
        breakeven = closed_n - wins - losses
        win_rate = (wins / closed_n * 100) if closed_n > 0 else 0.0
        total_invested = sum(t.total_cost for t in buys)

        # Cumulative realized P&L by calendar day (UTC), aligned with closed Position rows.
        by_day: dict = {}
        for p in closed_positions:
            ts = p.closed_at
            if ts is None:
                continue
            try:
                day_key = ts.date() if hasattr(ts, "date") else ts
            except Exception:
                continue
            by_day[day_key] = by_day.get(day_key, 0.0) + _rp(p)

        cum = 0.0
        daily_pnl: list = []
        for day_key in sorted(by_day.keys()):
            cum += by_day[day_key]
            daily_pnl.append(
                {
                    "date": day_key.strftime("%b %d, %Y") if hasattr(day_key, "strftime") else str(day_key),
                    "pnl": round(cum, 2),
                }
            )
        if not daily_pnl and closed_n > 0:
            daily_pnl = [{"date": "All closed", "pnl": round(total_realized, 2)}]

        return {
            "fills_total": len(trades),
            "buy_count": len(buys),
            "sell_count": ledger_sell_rows,
            "closed_positions_count": closed_n,
            "closed_wins_count": wins,
            "closed_losses_count": losses,
            "closed_breakeven_count": breakeven,
            "total_invested": total_invested,
            "total_realized_pnl": round(total_realized, 4),
            "total_gained": round(total_gained, 4),
            "total_lost": round(total_lost, 4),
            "win_rate": round(win_rate, 4),
            "daily_pnl": daily_pnl[-30:],
            "timestamp": utc_iso_z(utc_now()),
        }
    except Exception as e:
        logger.error("Performance error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
