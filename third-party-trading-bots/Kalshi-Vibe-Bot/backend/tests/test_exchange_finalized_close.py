"""Tests for closing open live rows when Kalshi market metadata is payout-complete."""

import asyncio

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.database.models import Base, Position
from src.reconcile.kalshi_positions import recent_settlement_close_blocks_kalshi_import
from src.reconcile.kalshi_settlement import close_open_live_positions_when_kalshi_exchange_finalized
from src.util.datetimes import utc_now


def test_recent_settlement_close_blocks_import():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Sess = sessionmaker(bind=engine)
    db = Sess()
    now = utc_now()
    db.add(
        Position(
            id="c1",
            market_id="KXTEST-FINAL",
            market_title="t",
            side="YES",
            quantity=2,
            entry_price=0.4,
            entry_cost=0.8,
            current_price=1.0,
            status="closed",
            trade_mode="live",
            closed_at=now,
            realized_pnl=1.2,
            exit_reason="settlement",
        )
    )
    db.commit()
    assert (
        recent_settlement_close_blocks_kalshi_import(
            db, trade_mode="live", market_id="KXTEST-FINAL", side="YES"
        )
        is True
    )
    assert (
        recent_settlement_close_blocks_kalshi_import(
            db, trade_mode="live", market_id="KXOTHER", side="YES"
        )
        is False
    )


def test_exchange_finalized_closes_open_row():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Sess = sessionmaker(bind=engine)
    db = Sess()
    p = Position(
        id="o1",
        market_id="KXFIN-1",
        market_title="m",
        side="YES",
        quantity=10,
        entry_price=0.5,
        entry_cost=5.0,
        current_price=1.0,
        status="open",
        trade_mode="live",
        close_time="2019-06-01T00:00:00+00:00",
        kalshi_market_status="finalized",
        kalshi_market_result="yes",
        fees_paid=0.1,
    )
    db.add(p)
    db.commit()

    n = asyncio.run(
        close_open_live_positions_when_kalshi_exchange_finalized(
            db,
            trade_mode="live",
            _api_rows=[],
            broadcast_fn=None,
            kalshi_client=None,
        )
    )
    assert n == 1
    db.refresh(p)
    assert p.status == "closed"
    assert p.exit_reason == "settlement"
    assert abs(float(p.realized_pnl or 0) - (10.0 * 1.0 - 5.0 - 0.1)) < 1e-5


def test_exchange_finalized_closes_when_contractual_close_still_future():
    """Regression: finalized + result must close even if contractual ``close_time`` is not yet passed."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Sess = sessionmaker(bind=engine)
    db = Sess()
    future = "2030-12-31T23:59:59Z"
    p = Position(
        id="o-fut",
        market_id="KXPGA3BALL-TEST",
        market_title="m",
        side="YES",
        quantity=14,
        entry_price=0.2943,
        entry_cost=4.12,
        current_price=0.0,
        status="open",
        trade_mode="live",
        close_time=future,
        kalshi_market_status="finalized",
        kalshi_market_result="yes",
        fees_paid=0.02,
    )
    db.add(p)
    db.commit()

    n = asyncio.run(
        close_open_live_positions_when_kalshi_exchange_finalized(
            db,
            trade_mode="live",
            _api_rows=[],
            broadcast_fn=None,
            kalshi_client=None,
        )
    )
    assert n == 1
    db.refresh(p)
    assert p.status == "closed"
    assert p.exit_reason == "settlement"


def test_exchange_finalized_skips_when_not_payout_complete():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Sess = sessionmaker(bind=engine)
    db = Sess()
    p = Position(
        id="o2",
        market_id="KXDET-1",
        market_title="m",
        side="YES",
        quantity=1,
        entry_price=0.5,
        entry_cost=0.5,
        current_price=0.6,
        status="open",
        trade_mode="live",
        close_time="2019-06-01T00:00:00+00:00",
        kalshi_market_status="determined",
        kalshi_market_result="yes",
        fees_paid=0.0,
    )
    db.add(p)
    db.commit()

    n = asyncio.run(
        close_open_live_positions_when_kalshi_exchange_finalized(
            db,
            trade_mode="live",
            _api_rows=[],
            broadcast_fn=None,
            kalshi_client=None,
        )
    )
    assert n == 0
    db.refresh(p)
    assert p.status == "open"
