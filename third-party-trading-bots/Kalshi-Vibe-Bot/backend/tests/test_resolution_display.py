"""Post-close resolution helpers for dashboard Est. Value / unrealized display."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from src.database.models import Position
from src.reconcile.open_positions import (
    closed_position_kalshi_outcome_pending,
    display_estimated_price_optional,
    kalshi_binary_outcome_official_for_display,
    position_display_ends_contract_fallback_active,
    position_display_ends_iso,
    position_market_close_time_passed,
    resolution_intrinsic_mark_dollars,
    resolution_kalshi_payout_complete_display,
    resolution_outcome_pending_display,
    resolution_awaiting_payout_display,
    unrealized_pnl_display_optional,
)


def _pos(**kw) -> Position:
    defaults = dict(
        id="x",
        market_id="KXTEST",
        market_title="t",
        side="YES",
        quantity=2,
        entry_price=0.5,
        entry_cost=1.0,
        current_price=0.5,
        unrealized_pnl=0.0,
        trade_mode="live",
        opened_at=datetime.now(timezone.utc),
    )
    defaults.update(kw)
    return Position(**defaults)


class TestResolutionDisplay(unittest.TestCase):
    def test_intrinsic_yes_holder_win(self):
        p = _pos(
            side="YES",
            kalshi_market_status="determined",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertAlmostEqual(resolution_intrinsic_mark_dollars(p), 1.0)

    def test_intrinsic_when_kalshi_status_is_finalized(self):
        """Kalshi trade-api v2 often uses ``finalized`` instead of ``determined`` once ``result`` is set."""
        p = _pos(
            side="YES",
            kalshi_market_status="finalized",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertTrue(kalshi_binary_outcome_official_for_display(p))
        self.assertAlmostEqual(resolution_intrinsic_mark_dollars(p), 1.0)
        self.assertFalse(resolution_outcome_pending_display(p))
        self.assertFalse(resolution_awaiting_payout_display(p))
        self.assertTrue(resolution_kalshi_payout_complete_display(p))

    def test_payout_complete_and_display_intrinsic_before_contractual_close(self):
        """Sports rows may finalize while contractual ``close_time`` is still far out — reconcile must not wait."""
        future = (datetime.now(timezone.utc) + timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ")
        p = _pos(
            side="YES",
            quantity=14,
            entry_price=0.2943,
            entry_cost=4.12,
            fees_paid=0.0,
            kalshi_market_status="finalized",
            kalshi_market_result="yes",
            close_time=future,
            estimated_price=0.99,
        )
        self.assertFalse(position_market_close_time_passed(p))
        self.assertTrue(resolution_kalshi_payout_complete_display(p))
        self.assertAlmostEqual(display_estimated_price_optional(p), 1.0)
        self.assertAlmostEqual(unrealized_pnl_display_optional(p), 14.0 - 4.12, places=5)

    def test_settled_alias_matches_finalized_for_payout_complete(self):
        p = _pos(
            side="YES",
            kalshi_market_status="settled",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertFalse(resolution_awaiting_payout_display(p))
        self.assertTrue(resolution_kalshi_payout_complete_display(p))

    def test_awaiting_payout_only_when_determined_not_finalized(self):
        d = _pos(
            side="YES",
            kalshi_market_status="determined",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertTrue(resolution_awaiting_payout_display(d))
        self.assertFalse(resolution_kalshi_payout_complete_display(d))

    def test_closed_with_result_counts_as_settlement_pending(self):
        """Transitional API may attach ``result`` while still not ``finalized``."""
        p = _pos(
            side="YES",
            kalshi_market_status="closed",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertTrue(resolution_awaiting_payout_display(p))
        self.assertFalse(resolution_kalshi_payout_complete_display(p))

    def test_intrinsic_closed_with_result(self):
        p = _pos(
            side="NO",
            kalshi_market_status="closed",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertTrue(kalshi_binary_outcome_official_for_display(p))
        self.assertAlmostEqual(resolution_intrinsic_mark_dollars(p), 0.0)

    def test_not_official_while_tradeable_even_if_result_present(self):
        p = _pos(
            side="YES",
            kalshi_market_status="active",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertFalse(kalshi_binary_outcome_official_for_display(p))
        self.assertIsNone(resolution_intrinsic_mark_dollars(p))

    def test_intrinsic_yes_holder_lose(self):
        p = _pos(
            side="YES",
            kalshi_market_status="determined",
            kalshi_market_result="no",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertAlmostEqual(resolution_intrinsic_mark_dollars(p), 0.0)

    def test_intrinsic_no_holder_win(self):
        p = _pos(
            side="NO",
            kalshi_market_status="determined",
            kalshi_market_result="no",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertAlmostEqual(resolution_intrinsic_mark_dollars(p), 1.0)

    def test_closed_without_result_no_intrinsic(self):
        p = _pos(
            side="YES",
            kalshi_market_status="closed",
            kalshi_market_result=None,
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertIsNone(resolution_intrinsic_mark_dollars(p))
        self.assertTrue(resolution_outcome_pending_display(p))

    def test_display_none_until_determined_after_close(self):
        future = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
        p_live = _pos(
            estimated_price=0.66,
            kalshi_market_status="active",
            close_time=future,
        )
        self.assertAlmostEqual(display_estimated_price_optional(p_live), 0.66)

        p_pending = _pos(
            estimated_price=0.66,
            kalshi_market_status="closed",
            kalshi_market_result=None,
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertIsNone(display_estimated_price_optional(p_pending))
        self.assertIsNone(unrealized_pnl_display_optional(p_pending))

    def test_display_ends_iso_uses_close_when_closed_even_if_expected_later(self):
        """Regression: illiquid closed rows must not count down from far ``expected_expiration_time``."""
        p = _pos(
            kalshi_market_status="closed",
            close_time="2026-05-08T20:00:00Z",
            expected_expiration_time="2026-05-15T12:00:00Z",
        )
        self.assertEqual(position_display_ends_iso(p), "2026-05-08T20:00:00Z")

    def test_option_c_tradeable_before_provisional_peg_keeps_expected_horizon(self):
        peg = datetime(2026, 5, 10, 12, 0, tzinfo=timezone.utc)
        before = peg - timedelta(hours=2)
        p = _pos(
            kalshi_market_status="active",
            expected_expiration_time="2026-05-10T12:00:00Z",
            close_time="2026-05-24T09:00:00Z",
        )
        self.assertEqual(
            position_display_ends_iso(p, reference_now=before),
            "2026-05-10T12:00:00Z",
        )
        self.assertFalse(position_market_close_time_passed(p, reference_now=before))
        self.assertFalse(position_display_ends_contract_fallback_active(p, reference_now=before))

    def test_option_c_tradeable_after_provisional_peg_falls_back_to_contract_close(self):
        peg = datetime(2026, 5, 10, 12, 0, tzinfo=timezone.utc)
        after = peg + timedelta(hours=2)
        p = _pos(
            kalshi_market_status="active",
            expected_expiration_time="2026-05-10T12:00:00Z",
            close_time="2026-05-24T09:00:00Z",
        )
        self.assertEqual(
            position_display_ends_iso(p, reference_now=after),
            "2026-05-24T09:00:00Z",
        )
        self.assertFalse(position_market_close_time_passed(p, reference_now=after))
        self.assertTrue(position_display_ends_contract_fallback_active(p, reference_now=after))

    def test_display_ends_iso_uses_close_when_determined(self):
        p = _pos(
            kalshi_market_status="determined",
            kalshi_market_result="yes",
            close_time="2026-05-08T20:00:00Z",
            expected_expiration_time="2026-05-16T00:00:00Z",
        )
        self.assertEqual(position_display_ends_iso(p), "2026-05-08T20:00:00Z")

    def test_display_ends_iso_terminal_prefers_earlier_event_vs_contractual_close(self):
        """PGA-style: round peg on ``expected_expiration_time`` can be weeks before series ``close_time``."""
        p = _pos(
            kalshi_market_status="finalized",
            kalshi_market_result="yes",
            close_time="2026-05-28T13:02:00Z",
            expected_expiration_time="2026-05-14T13:02:00Z",
        )
        self.assertEqual(position_display_ends_iso(p), "2026-05-14T13:02:00Z")

    def test_display_intrinsic_when_determined(self):
        p = _pos(
            side="YES",
            quantity=1,
            entry_price=0.4,
            entry_cost=0.4,
            fees_paid=0.02,
            kalshi_market_status="determined",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertAlmostEqual(display_estimated_price_optional(p), 1.0)
        # 1.0 * 1 - (0.4 + 0.02) = 0.58
        self.assertAlmostEqual(unrealized_pnl_display_optional(p), 0.58, places=5)


    def test_closed_row_outcome_pending_without_result(self):
        p = _pos(
            status="closed",
            kalshi_market_result=None,
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertTrue(closed_position_kalshi_outcome_pending(p))
        p2 = _pos(
            status="closed",
            kalshi_market_result="yes",
            close_time="2020-01-01T00:00:00Z",
        )
        self.assertFalse(closed_position_kalshi_outcome_pending(p2))


if __name__ == "__main__":
    unittest.main()
