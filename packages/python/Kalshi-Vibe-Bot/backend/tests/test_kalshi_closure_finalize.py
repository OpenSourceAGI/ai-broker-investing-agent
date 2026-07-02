"""Tests for Kalshi-authoritative closed-position PnL and finalization."""

import asyncio

from src.util.datetimes import utc_now

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database.models import Base, Position, Trade
from src.reconcile.kalshi_closed_position_finalize import finalize_live_closed_positions_from_kalshi
from src.reconcile.kalshi_settlement import (
    authoritative_realized_pnl_from_settlement_row,
    position_matches_settlement_row,
)


def test_position_matches_relax_no_leg_when_only_yes_count_fp():
    """Kalshi may list winning-side count only; NO leg still has ``no_total_cost_dollars``."""
    p = Position(
        id="m1",
        market_id="KXNO",
        market_title="",
        side="NO",
        quantity=4,
        entry_price=0.14,
        entry_cost=0.56,
        current_price=0.0,
        status="closed",
        trade_mode="live",
        closed_at=utc_now(),
        realized_pnl=0.0,
        kalshi_closure_finalized=False,
    )
    s = {
        "yes_count_fp": "500.00",
        "no_count_fp": "0.00",
        "no_total_cost_dollars": "0.5600",
        "yes_total_cost_dollars": "400.0000",
        "market_result": "yes",
    }
    assert position_matches_settlement_row(p, s, relax_quantity=True) is True


def test_authoritative_no_leg_when_no_count_fp_zero_but_market_result_yes():
    pos = type(
        "P",
        (),
        {
            "side": "NO",
            "quantity": 4,
            "entry_cost": 0.56,
        },
    )()
    s = {
        "ticker": "KXNO",
        "yes_count_fp": "500.00",
        "no_count_fp": "0.00",
        "yes_total_cost_dollars": "400.0000",
        "no_total_cost_dollars": "0.5600",
        "revenue": 0,
        "fee_cost": "0.0400",
        "market_result": "yes",
    }
    rp = authoritative_realized_pnl_from_settlement_row(pos, s)
    assert rp is not None
    assert abs(float(rp) - (0.0 - 0.56 - 0.04)) < 1e-6


def test_authoritative_settlement_yes_leg():
    pos = type(
        "P",
        (),
        {
            "side": "YES",
            "quantity": 10,
            "entry_cost": 999.0,
        },
    )()
    s = {
        "ticker": "KXTEST-YES",
        "yes_count_fp": "10.00",
        "no_count_fp": "0.00",
        "yes_total_cost_dollars": "6.0000",
        "no_total_cost_dollars": "0.0000",
        "revenue": 1000,
        "fee_cost": "0.3400",
        "market_result": "yes",
    }
    rp = authoritative_realized_pnl_from_settlement_row(pos, s)
    assert rp is not None
    assert abs(float(rp) - (10.0 - 6.0 - 0.34)) < 1e-6


def test_authoritative_skips_mixed_yes_no():
    pos = type("P", (), {"side": "YES", "quantity": 5, "entry_cost": 1.0})()
    s = {
        "yes_count_fp": "5.00",
        "no_count_fp": "3.00",
        "yes_total_cost_dollars": "3",
        "no_total_cost_dollars": "2",
        "revenue": 500,
        "fee_cost": "0.1",
    }
    assert authoritative_realized_pnl_from_settlement_row(pos, s) is None


def test_finalize_marks_idle_closed_rows():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Sess = sessionmaker(bind=engine)
    db = Sess()
    now = utc_now()
    p = Position(
        id="p1",
        market_id="KXTEST",
        market_title="t",
        side="YES",
        quantity=1,
        entry_price=0.5,
        entry_cost=0.5,
        current_price=0.6,
        status="closed",
        trade_mode="live",
        closed_at=now,
        realized_pnl=0.1,
        kalshi_flat_reconcile_pending=False,
        kalshi_closure_finalized=False,
    )
    db.add(p)
    db.commit()

    class _NoopKc:
        async def get_order(self, _oid: str):
            return {}

    n = asyncio.run(
        finalize_live_closed_positions_from_kalshi(
            db,
            trade_mode="live",
            kalshi_client=_NoopKc(),
            settlement_rows=[],
        )
    )
    assert n == 1
    db.commit()
    db.refresh(p)
    assert p.kalshi_closure_finalized is True


def test_finalize_settlement_overwrites_realized():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Sess = sessionmaker(bind=engine)
    db = Sess()
    now = utc_now()
    p = Position(
        id="p2",
        market_id="KXSETTLE",
        market_title="t",
        side="YES",
        quantity=2,
        entry_price=0.4,
        entry_cost=0.8,
        current_price=1.0,
        status="closed",
        trade_mode="live",
        closed_at=now,
        realized_pnl=9.99,
        kalshi_flat_reconcile_pending=True,
        kalshi_closure_finalized=False,
    )
    db.add(p)
    db.commit()
    s = {
        "ticker": "KXSETTLE",
        "yes_count_fp": "2.00",
        "no_count_fp": "0.00",
        "yes_total_cost_dollars": "0.8000",
        "no_total_cost_dollars": "0.0000",
        "revenue": 200,
        "fee_cost": "0.0200",
        "market_result": "yes",
    }

    class _NoopKc:
        async def get_order(self, _oid: str):
            return {}

    n = asyncio.run(
        finalize_live_closed_positions_from_kalshi(
            db,
            trade_mode="live",
            kalshi_client=_NoopKc(),
            settlement_rows=[s],
        )
    )
    assert n == 1
    db.commit()
    db.refresh(p)
    assert p.kalshi_closure_finalized is True
    assert p.kalshi_flat_reconcile_pending is False
    assert abs(float(p.realized_pnl) - (2.0 - 0.8 - 0.02)) < 1e-6


def test_finalize_get_order_refreshes_exit():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Sess = sessionmaker(bind=engine)
    db = Sess()
    now = utc_now()
    p = Position(
        id="p3",
        market_id="KXEXIT",
        market_title="t",
        side="NO",
        quantity=1,
        entry_price=0.35,
        entry_cost=0.35,
        current_price=0.5,
        status="closed",
        trade_mode="live",
        closed_at=now,
        exit_reason="take_profit",
        realized_pnl=0.01,
        fees_paid=0.01,
        kalshi_flat_reconcile_pending=True,
        kalshi_closure_finalized=False,
    )
    db.add(
        Trade(
            id="ord-xyz",
            market_id="KXEXIT",
            market_title="t",
            action="sell",
            side="NO",
            quantity=1,
            price=0.5,
            total_cost=0.5,
            realized_pnl=0.01,
            trade_mode="live",
            timestamp=now,
        )
    )
    db.add(p)
    db.commit()

    class _Kc:
        async def get_order(self, oid: str):
            if oid != "ord-xyz":
                return {}
            return {
                "order_id": "ord-xyz",
                "side": "no",
                "action": "sell",
                "fill_count_fp": "1",
                "taker_fill_cost_dollars": "-0.44",
                "maker_fill_cost_dollars": "0",
                "taker_fees_dollars": "0.01",
                "maker_fees_dollars": "0",
                "yes_price_dollars": "0.5",
                "no_price_dollars": "0.5",
            }

    n = asyncio.run(
        finalize_live_closed_positions_from_kalshi(
            db,
            trade_mode="live",
            kalshi_client=_Kc(),
            settlement_rows=[],
        )
    )
    assert n == 1
    db.commit()
    db.refresh(p)
    assert p.kalshi_closure_finalized is True
    # Kalshi UI: gross exit notional (1 × ~0.44) − (entry notional + round-trip fees 0.01).
    assert abs(float(p.realized_pnl) - (0.44 - 0.35 - 0.01)) < 1e-5


def test_finalize_get_order_refreshes_exit_even_when_flat_pending_cleared():
    """After portfolio delta reconcile clears ``kalshi_flat_reconcile_pending``, GET order must still run."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Sess = sessionmaker(bind=engine)
    db = Sess()
    now = utc_now()
    p = Position(
        id="p4",
        market_id="KXEXIT2",
        market_title="t",
        side="NO",
        quantity=1,
        entry_price=0.35,
        entry_cost=0.35,
        current_price=0.5,
        status="closed",
        trade_mode="live",
        closed_at=now,
        exit_reason="take_profit",
        realized_pnl=0.01,
        fees_paid=0.01,
        kalshi_flat_reconcile_pending=False,
        kalshi_closure_finalized=False,
    )
    db.add(
        Trade(
            id="ord-p4",
            market_id="KXEXIT2",
            market_title="t",
            action="sell",
            side="NO",
            quantity=1,
            price=0.5,
            total_cost=0.5,
            realized_pnl=0.01,
            trade_mode="live",
            timestamp=now,
        )
    )
    db.add(p)
    db.commit()

    class _Kc:
        async def get_order(self, oid: str):
            if oid != "ord-p4":
                return {}
            return {
                "order_id": "ord-p4",
                "side": "no",
                "action": "sell",
                "fill_count_fp": "1",
                "taker_fill_cost_dollars": "-0.44",
                "maker_fill_cost_dollars": "0",
                "taker_fees_dollars": "0.01",
                "maker_fees_dollars": "0",
                "yes_price_dollars": "0.5",
                "no_price_dollars": "0.5",
            }

    n = asyncio.run(
        finalize_live_closed_positions_from_kalshi(
            db,
            trade_mode="live",
            kalshi_client=_Kc(),
            settlement_rows=[],
        )
    )
    assert n == 1
    db.commit()
    db.refresh(p)
    assert p.kalshi_closure_finalized is True
    assert abs(float(p.realized_pnl) - (0.44 - 0.35 - 0.01)) < 1e-5
