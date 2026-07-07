import unittest

from src.reconcile.open_positions import (
    stop_loss_entry_price_per_contract,
    stop_loss_mark_drawdown_fraction,
    stop_loss_triggered_from_position,
    stop_loss_value_drawdown_triggered,
)
from src.database.models import Position
from src.util.datetimes import utc_now


class TestStopLossValueDrawdown(unittest.TestCase):
    def test_triggers_when_est_falls_enough_vs_entry(self):
        self.assertTrue(
            stop_loss_value_drawdown_triggered(
                entry_price_per_contract=1.0,
                estimated_price_per_contract=0.70,
                stop_loss_drawdown_pct=0.25,
            )
        )

    def test_no_trigger_below_threshold(self):
        self.assertFalse(
            stop_loss_value_drawdown_triggered(
                entry_price_per_contract=1.0,
                estimated_price_per_contract=0.80,
                stop_loss_drawdown_pct=0.25,
            )
        )

    def test_same_entry_and_est_is_zero_drawdown(self):
        """Entry 52¢ and Est. 52¢ → 0% stop drawdown (fees do not affect this)."""
        self.assertFalse(
            stop_loss_value_drawdown_triggered(
                entry_price_per_contract=0.52,
                estimated_price_per_contract=0.52,
                stop_loss_drawdown_pct=0.04,
            )
        )
        dd = stop_loss_mark_drawdown_fraction(
            Position(
                id="p0",
                market_id="KX",
                market_title="t",
                side="NO",
                quantity=1,
                entry_price=0.52,
                entry_cost=0.54,
                current_price=0.52,
                unrealized_pnl=0.0,
                status="open",
                trade_mode="live",
                opened_at=utc_now(),
                fees_paid=0.02,
                estimated_price=0.52,
            )
        )
        self.assertIsNotNone(dd)
        assert dd is not None
        self.assertLess(abs(dd), 1e-9)

    def test_unknown_est_never_triggers(self):
        self.assertFalse(
            stop_loss_value_drawdown_triggered(
                entry_price_per_contract=0.52,
                estimated_price_per_contract=None,
                stop_loss_drawdown_pct=0.80,
            )
        )

    def test_no_entry_never_triggers(self):
        self.assertFalse(
            stop_loss_value_drawdown_triggered(
                entry_price_per_contract=0.0,
                estimated_price_per_contract=0.5,
                stop_loss_drawdown_pct=0.25,
            )
        )

    def test_from_position_uses_entry_not_fees(self):
        p = Position(
            id="p1",
            market_id="KX",
            market_title="t",
            side="YES",
            quantity=10,
            entry_price=1.0,
            entry_cost=10.5,
            current_price=0.5,
            unrealized_pnl=0.0,
            status="open",
            trade_mode="paper",
            opened_at=utc_now(),
            fees_paid=0.5,
            estimated_price=0.70,
            bid_price=0.10,
        )
        self.assertEqual(stop_loss_entry_price_per_contract(p), 1.0)
        self.assertTrue(stop_loss_triggered_from_position(p, stop_loss_drawdown_pct=0.25))


if __name__ == "__main__":
    unittest.main()
