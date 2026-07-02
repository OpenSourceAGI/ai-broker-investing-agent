import unittest
from datetime import datetime, timedelta, timezone

from src.bot.loop import is_tradeable_market


def _close_in(hours: float) -> str:
    t = datetime.now(timezone.utc) + timedelta(hours=hours)
    return t.replace(microsecond=0).isoformat().replace("+00:00", "Z")


class TestIsTradeableMarket(unittest.TestCase):
    def _base(self) -> dict:
        ct = _close_in(24)
        return {
            "id": "KXTEST-1",
            "market_type": "binary",
            "status": "open",
            "volume": 1000.0,
            "yes_price": 0.45,
            "yes_bid": 0.43,
            "yes_ask": 0.47,
            "yes_spread": 0.04,
            "yes_ask_size": 50.0,
            "no_bid": 0.53,
            "no_ask": 0.57,
            "no_spread": 0.04,
            "no_ask_size": 50.0,
            "close_time": ct,
            "vetting_horizon_time": ct,
        }

    def test_passes_healthy_book(self):
        ok, reason = is_tradeable_market(self._base(), max_hours=48)
        self.assertTrue(ok, reason)

    def test_rejects_low_volume(self):
        m = self._base()
        m["volume"] = 1.0
        ok, reason = is_tradeable_market(m, min_volume=1000.0)
        self.assertFalse(ok)
        self.assertIn("low_volume", reason)

    def test_rejects_too_close_to_expiry(self):
        m = self._base()
        m["close_time"] = _close_in(0.5)  # 30 minutes
        m["vetting_horizon_time"] = m["close_time"]
        ok, reason = is_tradeable_market(m, max_hours=0)
        self.assertFalse(ok)
        self.assertIn("too_far_out", reason)

    def test_far_contractual_close_ok_when_expected_expiration_soon(self):
        """Sports-style: contractual close can be days out while the event ends soon."""
        m = self._base()
        soon = _close_in(6)
        m["close_time"] = _close_in(500)
        m["vetting_horizon_time"] = soon
        m["expected_expiration_time"] = soon
        ok, reason = is_tradeable_market(m, max_hours=12)
        self.assertTrue(ok, reason)

    def test_far_expected_expiration_rejects_even_if_vetting_soon(self):
        m = self._base()
        m["expected_expiration_time"] = _close_in(500)
        m["vetting_horizon_time"] = _close_in(6)
        m["close_time"] = _close_in(500)
        ok, reason = is_tradeable_market(m, max_hours=12)
        self.assertFalse(ok)
        self.assertEqual(reason, "too_far_out")

    def test_both_horizons_within_window_passes(self):
        m = self._base()
        soon = _close_in(4)
        m["close_time"] = soon
        m["vetting_horizon_time"] = soon
        ok, reason = is_tradeable_market(m, max_hours=12)
        self.assertTrue(ok, reason)

    def test_fallback_close_when_expected_expiration_passed(self):
        """When ``expected_expiration_time`` is past, vetting uses other anchors (e.g. contractual close)."""
        m = self._base()
        m["close_time"] = _close_in(6)
        m["vetting_horizon_time"] = m["close_time"]
        past = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat().replace("+00:00", "Z")
        m["expected_expiration_time"] = past
        ok, reason = is_tradeable_market(m, max_hours=12)
        self.assertTrue(ok, reason)

    def test_missing_vetting_horizon_falls_back_to_close_time(self):
        m = self._base()
        m["vetting_horizon_time"] = None
        ok, reason = is_tradeable_market(m, max_hours=48)
        self.assertTrue(ok, reason)

    def test_rejects_when_both_close_and_vetting_missing(self):
        m = self._base()
        m["vetting_horizon_time"] = None
        m["close_time"] = None
        ok, reason = is_tradeable_market(m, max_hours=48)
        self.assertFalse(ok)
        self.assertEqual(reason, "no_event_horizon")

    def test_skewed_book_only_expensive_side_liquid_below_residual_floor(self):
        """YES longshot leg fails one-way-book rule; NO leg is liquid but 1−ask < floor — no viable buy."""
        m = self._base()
        m["yes_bid"] = 0.0
        m["yes_ask"] = 0.07
        m["yes_spread"] = 0.07
        m["yes_ask_size"] = 500.0
        m["no_bid"] = 0.90
        m["no_ask"] = 0.97
        m["no_spread"] = 0.07
        m["no_ask_size"] = 500.0
        ok, reason = is_tradeable_market(m, max_hours=48, min_residual_payoff=0.10)
        self.assertFalse(ok)
        self.assertIn("no_buy_meets_residual_floor", reason)

    def test_healthy_book_passes_with_residual_floor_enabled(self):
        ok, reason = is_tradeable_market(self._base(), max_hours=48, min_residual_payoff=0.10)
        self.assertTrue(ok, reason)

    def test_extreme_yes_favorite_snapshot_skew_rejected(self):
        m = self._base()
        m["yes_price"] = 0.94
        m["no_price"] = 0.08
        ok, reason = is_tradeable_market(m, max_hours=48)
        self.assertFalse(ok)
        self.assertEqual(reason, "extreme_binary_snapshot_skew")

    def test_extreme_no_favorite_snapshot_skew_rejected(self):
        m = self._base()
        m["yes_price"] = 0.06
        m["no_price"] = 0.95
        ok, reason = is_tradeable_market(m, max_hours=48)
        self.assertFalse(ok)
        self.assertEqual(reason, "extreme_binary_snapshot_skew")

    def test_high_yes_without_low_no_not_skew_blocked(self):
        m = self._base()
        m["yes_price"] = 0.94
        m["no_price"] = 0.25
        ok, reason = is_tradeable_market(m, max_hours=48)
        self.assertTrue(ok, reason)
