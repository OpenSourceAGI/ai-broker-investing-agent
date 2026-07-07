"""Kalshi portfolio snapshot → open position sync."""

from types import SimpleNamespace

from src.reconcile.kalshi_positions import (
    KalshiPositionSnapshot,
    apply_kalshi_snapshot_to_open_position,
)


def test_apply_snapshot_syncs_kalshi_market_exposure_entry_basis():
    """NO leg: portfolio exposure (~76¢) is Kalshi cost basis; must not keep order-fill NO cash (~26¢)."""
    pos = SimpleNamespace(
        quantity=7,
        entry_cost=1.95,
        entry_price=0.2643,
        fees_paid=0.10,
    )
    snap = KalshiPositionSnapshot(
        ticker="KXPGAWIN-PGC26LIV-1",
        side="NO",
        qty_whole=7,
        qty_raw_fp=7.0,
        cost_usd=5.35,
        avg_price=0.7643,
        fees_paid_dollars=0.12,
        realized_locked_dollars=0.0,
        realized_pnl_usd=None,
    )
    assert apply_kalshi_snapshot_to_open_position(pos, snap) is True
    assert pos.quantity == 7
    assert abs(pos.fees_paid - 0.12) < 1e-9
    assert abs(pos.entry_cost - 5.35) < 1e-9
    assert abs(pos.entry_price - 0.7643) < 1e-9
