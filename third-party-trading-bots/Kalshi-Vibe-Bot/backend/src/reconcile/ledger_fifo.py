"""FIFO cost basis from Trade ledger rows (per market_id + side).

Sells store ``total_cost`` as **proceeds** (see bot loop). Buys store ``total_cost`` as cash paid.
Using FIFO matches economic round-trip P&L from visible ledger rows and avoids bogus gains when
``Trade.realized_pnl`` was computed from stale proportional ``Position.entry_cost``.

Trade and position quantities are **whole contracts** (integer ``count`` on Kalshi orders).
"""

from __future__ import annotations

from collections import deque
from typing import TYPE_CHECKING, Deque, List, Tuple

from sqlalchemy import func

from src.reconcile.open_positions import normalize_market_id, normalize_side

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

LotQueue = Deque[List[float]]  # [qty_remaining, unit_cost]


def _apply_row_to_queue(q: LotQueue, *, quantity: int, total_cost: float, action: str) -> None:
    act = (action or "buy").lower()
    qty = max(0, int(round(float(quantity))))
    if qty <= 0:
        return
    tc = float(total_cost or 0.0)
    if act == "buy":
        q.append([qty, tc / qty if qty else 0.0])
        return
    if act != "sell":
        return
    rem = qty
    while rem > 0 and q:
        lot_qty, uc = q[0]
        take = min(rem, int(lot_qty))
        lot_qty -= take
        rem -= take
        if lot_qty <= 0:
            q.popleft()
        else:
            q[0][0] = float(lot_qty)


def fifo_cost_for_next_sell(
    db: "Session",
    *,
    trade_mode: str,
    market_id: str,
    side: str,
    sell_qty: int,
) -> Tuple[float, bool]:
    """Cost basis for the next ``sell_qty`` contracts using FIFO lots implied by prior ledger rows.

    Returns ``(cost, True)`` when inventory in the ledger fully covers ``sell_qty``; otherwise
    ``(partial_cost, False)`` — caller should fall back to another basis (e.g. Position slice).
    """
    from src.database.models import Trade

    mid = normalize_market_id(market_id)
    su = normalize_side(side)
    rows = (
        db.query(Trade)
        .filter(
            Trade.trade_mode == trade_mode,
            func.trim(Trade.market_id) == mid,
            func.upper(Trade.side) == su,
        )
        .order_by(Trade.timestamp.asc(), Trade.id.asc())
        .all()
    )
    q: LotQueue = deque()
    for t in rows:
        _apply_row_to_queue(
            q,
            quantity=int(t.quantity or 0),
            total_cost=float(t.total_cost or 0.0),
            action=str(getattr(t, "action", "buy") or "buy"),
        )
    sim: LotQueue = deque([[int(a), float(b)] for a, b in q])
    rem = max(0, int(round(float(sell_qty))))
    cost = 0.0
    while rem > 0 and sim:
        lot_qty, uc = sim[0]
        take = min(rem, int(lot_qty))
        cost += take * uc
        lot_qty -= take
        rem -= take
        if lot_qty <= 0:
            sim.popleft()
        else:
            sim[0][0] = float(lot_qty)
    return cost, rem == 0
