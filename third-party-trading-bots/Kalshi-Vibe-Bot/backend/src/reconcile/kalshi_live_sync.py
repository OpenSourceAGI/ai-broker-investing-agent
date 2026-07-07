"""Orchestrate a single ``GET /portfolio/positions`` pull with DB reconciliation (live mode)."""

from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from src.logger import setup_logging
from src.reconcile.kalshi_positions import (
    import_missing_open_positions_from_kalshi,
    refresh_open_live_positions_from_kalshi_orders,
    sync_open_positions_from_kalshi_portfolio_rows,
    sync_recent_closed_from_flat_portfolio_rows,
)
from src.reconcile.kalshi_closed_position_finalize import finalize_live_closed_positions_from_kalshi
from src.reconcile.kalshi_settlement import (
    apply_kalshi_settlement_closes,
    apply_kalshi_settlement_history_closes,
    close_open_live_positions_when_kalshi_exchange_finalized,
    merge_settlement_rows_for_stuck_live_positions,
)

logger = setup_logging("kalshi_live_sync")


async def reconcile_live_positions_from_kalshi(
    db: Session,
    *,
    trade_mode: str,
    kalshi_client: Any,
    settlements: bool = True,
    broadcast_fn: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
) -> Tuple[int, int, int, int, int, int, int, int, int]:
    """Fetch Kalshi portfolio positions once and sync local ``Position`` rows.

    1. **Existing** open rows: quantity, ``entry_cost`` / ``entry_price`` (``market_exposure``), ``fees_paid`` from API.
    2. **Missing** open rows: insert ``Position`` rows for Kalshi-only holdings (same key dedupe via
       :func:`src.reconcile.open_positions.get_open_position`).
    3. **Open live refinement** — ``GET /portfolio/orders/{buy}`` entry basis + mark/unrealized P&L.
    4. Optional settlement pipeline (portfolio flat rows + settlements API), then **exchange-finalized**
       closes for open rows whose stored ``GET /markets`` lifecycle already shows payout-complete while the
       portfolio/settlement path missed the leg.
    5. Closed rows: ``kalshi_flat_reconcile_pending`` + per-market cursor apply **Δrealized / Δfees**
       from flat ``GET /portfolio/positions`` rows (handles re-entries vs cumulative Kalshi totals).
    6. **Closure finalization** — settlement rows and/or ``GET /portfolio/orders/{id}`` for rows
       still marked ``kalshi_closure_finalized`` false.

    Returns ``(n_open_field_updates, n_open_positions_imported, n_portfolio_settlement_closed,
    n_hist_closed, n_flat_closed_patches, n_closure_finalized, n_open_entry_order_refresh,
    n_open_unrealized_refresh, n_exchange_finalized_closes)``.
    """
    if trade_mode != "live":
        return (0, 0, 0, 0, 0, 0, 0, 0, 0)

    api_rows: List[Dict[str, Any]] = list(await kalshi_client.get_positions() or [])
    n_open = sync_open_positions_from_kalshi_portfolio_rows(
        db, trade_mode=trade_mode, api_rows=api_rows
    )
    # Always commit here so we never carry a write transaction into ``await import_missing...``
    # (SQLite allows only one writer; holding sync_open changes blocks snapshot / other inserts).
    db.commit()

    n_imp = await import_missing_open_positions_from_kalshi(
        db,
        trade_mode=trade_mode,
        api_rows=api_rows,
        kalshi_client=kalshi_client,
    )
    if n_imp:
        logger.info("Imported %d open position(s) from Kalshi portfolio (no prior local row)", n_imp)

    n_ent, n_un = await refresh_open_live_positions_from_kalshi_orders(
        db, trade_mode=trade_mode, kalshi_client=kalshi_client
    )
    if n_ent or n_un:
        logger.info(
            "Open live Kalshi order/mark refresh: entry_field_updates=%d unrealized_updates=%d",
            n_ent,
            n_un,
        )
    try:
        db.commit()
    except Exception:
        db.rollback()

    n_port = 0
    n_hist = 0
    settles: List[Dict[str, Any]] = []
    if settlements:
        n_port = await apply_kalshi_settlement_closes(
            db,
            trade_mode=trade_mode,
            api_rows=api_rows,
            broadcast_fn=broadcast_fn,
            kalshi_client=kalshi_client,
        )
        if n_port:
            logger.info("Kalshi settlement sync (positions endpoint) closed %d row(s)", n_port)

        settles = await kalshi_client.get_settlements_cached()
        settles = await merge_settlement_rows_for_stuck_live_positions(
            db,
            trade_mode=trade_mode,
            kalshi_client=kalshi_client,
            base_rows=settles,
        )
        n_hist = await apply_kalshi_settlement_history_closes(
            db,
            trade_mode=trade_mode,
            settlement_rows=settles,
            broadcast_fn=broadcast_fn,
            kalshi_client=kalshi_client,
        )
        if n_hist:
            logger.info(
                "Kalshi settlements API (positions endpoint) closed %d row(s)",
                n_hist,
            )
    elif trade_mode == "live":
        settles = await kalshi_client.get_settlements_cached()
        settles = await merge_settlement_rows_for_stuck_live_positions(
            db,
            trade_mode=trade_mode,
            kalshi_client=kalshi_client,
            base_rows=settles,
        )

    n_exfin = await close_open_live_positions_when_kalshi_exchange_finalized(
        db,
        trade_mode=trade_mode,
        _api_rows=api_rows,
        broadcast_fn=broadcast_fn,
        kalshi_client=kalshi_client,
    )
    if n_exfin:
        logger.info(
            "Kalshi closed %d open row(s) from exchange-finalized market metadata (portfolio/settlement gap)",
            n_exfin,
        )

    n_flat = sync_recent_closed_from_flat_portfolio_rows(
        db, trade_mode=trade_mode, api_rows=api_rows
    )
    n_fin = await finalize_live_closed_positions_from_kalshi(
        db,
        trade_mode=trade_mode,
        kalshi_client=kalshi_client,
        settlement_rows=settles,
    )
    # Flush flat-row patches (if any) and release the session so ``GET /portfolio`` is not blocked.
    try:
        db.commit()
    except Exception:
        db.rollback()

    if n_open or n_imp or n_port or n_hist or n_flat or n_fin or n_ent or n_un or n_exfin:
        logger.info(
            "Kalshi live reconcile done: open_field_updates=%d imported=%d settlement_portfolio=%d "
            "settlement_hist=%d flat_row_patches=%d closure_finalized=%d open_entry_orders=%d open_unreal=%d "
            "exchange_finalized_closes=%d",
            n_open,
            n_imp,
            n_port,
            n_hist,
            n_flat,
            n_fin,
            n_ent,
            n_un,
            n_exfin,
        )
    else:
        logger.debug(
            "Kalshi live reconcile done: no row changes (open_updates=0 imported=0 settlements=0 flat=0)",
        )

    return (n_open, n_imp, n_port, n_hist, n_flat, n_fin, n_ent, n_un, n_exfin)


async def quick_sync_live_open_legs_from_kalshi(
    db: Session,
    *,
    trade_mode: str,
    kalshi_client: Any,
) -> tuple[int, int, int, int]:
    """``GET /portfolio/positions`` + open-row sync + order/mark refresh (no settlements / flat patches).

    Used when the shared UI full reconcile lock is busy so ``GET /positions`` can still import
    Kalshi-only holdings without waiting for the other handler to finish the full pipeline.
    """
    if trade_mode != "live":
        return (0, 0, 0, 0)
    api_rows: List[Dict[str, Any]] = list(await kalshi_client.get_positions() or [])
    n_open = sync_open_positions_from_kalshi_portfolio_rows(
        db, trade_mode=trade_mode, api_rows=api_rows
    )
    db.commit()
    n_imp = await import_missing_open_positions_from_kalshi(
        db,
        trade_mode=trade_mode,
        api_rows=api_rows,
        kalshi_client=kalshi_client,
    )
    n_ent, n_un = await refresh_open_live_positions_from_kalshi_orders(
        db, trade_mode=trade_mode, kalshi_client=kalshi_client
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
    if n_imp:
        logger.info(
            "Quick open-leg sync: imported %d Kalshi-only open row(s) (no prior local row)",
            n_imp,
        )
    elif n_open:
        logger.info("Quick open-leg sync: updated %d open row(s) from Kalshi portfolio", n_open)
    else:
        logger.debug("Quick open-leg sync: no open-leg changes from Kalshi")
    if n_ent or n_un:
        logger.info(
            "Quick open-leg sync: entry_order_updates=%d unrealized_updates=%d",
            n_ent,
            n_un,
        )
    return (n_open, n_imp, n_ent, n_un)
