"""Kalshi-aligned closed-leg invested / realized (cash basis)."""

from src.database.models import Position
from src.reconcile.open_positions import (
    closed_leg_realized_pnl_kalshi_dollars,
    open_cash_basis_dollars,
    open_position_cash_basis_dollars,
    unrealized_pnl_from_executable_mark_dollars,
)


def test_basis_when_entry_cost_includes_buy_fee_round_trip():
    """``entry_cost`` above notional embeds buy-side fees; ``fees_paid`` still carries sell — include both."""
    q, ep = 2, 0.48
    ep_line = ep * q  # 0.96
    ec = 1.0  # notional + 4¢ buy in cost
    fp = 0.08  # e.g. 4¢ buy + 4¢ sell tracked in fees_paid
    assert abs(open_cash_basis_dollars(ec, ep, q, fp) - 1.04) < 1e-9


def test_tsa_style_full_close():
    """2 × 48¢ entry + 4¢ buy fee + 4¢ sell fee invested; exit 35¢ × 2 gross → −34¢."""
    q, ep, ec = 2, 0.48, 0.96
    fees = 0.08
    assert abs(open_cash_basis_dollars(ec, ep, q, fees) - 1.04) < 1e-9
    pnl = closed_leg_realized_pnl_kalshi_dollars(
        quantity_sold=2,
        exit_price_per_contract_gross=0.35,
        entry_cost_at_open=ec,
        entry_price_at_open=ep,
        quantity_at_open=q,
        fees_paid_roundtrip=fees,
    )
    assert abs(pnl - (-0.34)) < 1e-9


def test_partial_exit_linear_invested_share():
    """Half the contracts → half the invested vs full gross exit on that half."""
    pnl = closed_leg_realized_pnl_kalshi_dollars(
        quantity_sold=1,
        exit_price_per_contract_gross=0.35,
        entry_cost_at_open=0.96,
        entry_price_at_open=0.48,
        quantity_at_open=2,
        fees_paid_roundtrip=0.08,
    )
    # invested half = 0.52, gross 0.35 → −0.17
    assert abs(pnl - (-0.17)) < 1e-9


def test_unrealized_infer_cost_when_missing_entry_cost():
    """Same heuristic as mark refresh: infer contract notional from price × qty when cost row is blank."""
    u = unrealized_pnl_from_executable_mark_dollars(
        mark_last=0.55,
        quantity=10,
        entry_cost=0.0,
        entry_price=0.5,
        fees_paid=0.0,
    )
    assert abs(u - 0.5) < 1e-9


def test_open_position_basis_infer_cost_from_price():
    p = Position(
        id="basis_infer_test",
        market_id="KXTEST",
        market_title="",
        side="YES",
        quantity=10,
        entry_price=0.5,
        entry_cost=0.0,
        current_price=0.55,
        unrealized_pnl=0.0,
        realized_pnl=0.0,
        trade_mode="live",
        fees_paid=0.0,
    )
    assert abs(open_position_cash_basis_dollars(p) - 5.0) < 1e-9
