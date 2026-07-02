import unittest

from src.bot.scan_eligibility import (
    MIN_DEPLOYABLE_USD_FOR_ORDER_SEARCH,
    TOTAL_BALANCE_WARN_BELOW_USD,
    compute_order_search_scan_labels,
)


class TestScanEligibility(unittest.TestCase):
    def test_deployable_below_minimum_blocks(self):
        settings = type("S", (), {})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            0.4,
            total_portfolio_value_usd=100.0,
        )
        self.assertFalse(active)
        self.assertIn("deployable funds under $1", label)

    def test_deployable_below_one_dollar_blocks(self):
        settings = type("S", (), {})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            0.5,
            total_portfolio_value_usd=500.0,
        )
        self.assertFalse(active)
        self.assertIn("deployable funds under $1", label)

    def test_ten_percent_of_forty_nine_passes(self):
        settings = type("S", (), {})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            49.04,
            total_portfolio_value_usd=500.0,
        )
        self.assertTrue(active)
        self.assertIn("searching for new positions", label)

    def test_play_with_cash_active(self):
        settings = type("S", (), {})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=500.0,
        )
        self.assertTrue(active)
        self.assertIn("searching for new positions", label)

    def test_pause_blocks(self):
        settings = type("S", (), {})()
        active, _ = compute_order_search_scan_labels(
            "pause",
            settings,
            100.0,
            total_portfolio_value_usd=500.0,
        )
        self.assertFalse(active)

    def test_xai_prepaid_below_one_blocks_when_known(self):
        settings = type("S", (), {"default_ai_provider": "xai"})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=500.0,
            xai_prepaid_balance_usd=0.5,
            ai_provider="xai",
        )
        self.assertFalse(active)
        self.assertEqual(label, "Insufficient xAI balance")

    def test_xai_prepaid_low_does_not_block_gemini(self):
        settings = type("S", (), {"default_ai_provider": "gemini"})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=500.0,
            xai_prepaid_balance_usd=0.5,
            ai_provider="gemini",
        )
        self.assertTrue(active)
        self.assertIn("searching for new positions", label)

    def test_xai_prepaid_unknown_does_not_block(self):
        settings = type("S", (), {})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=500.0,
            xai_prepaid_balance_usd=None,
        )
        self.assertTrue(active)
        self.assertIn("searching for new positions", label)

    def test_zero_total_balance_blocks(self):
        settings = type("S", (), {})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=0.0,
        )
        self.assertFalse(active)
        self.assertEqual(label, "Holding — zero total balance")

    def test_total_balance_under_five_blocks(self):
        settings = type("S", (), {})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=4.99,
        )
        self.assertFalse(active)
        self.assertEqual(label, "Holding — total balance under $5")

    def test_total_balance_exactly_five_passes_other_gates(self):
        settings = type("S", (), {})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=float(TOTAL_BALANCE_WARN_BELOW_USD),
        )
        self.assertTrue(active)
        self.assertIn("searching for new positions", label)

    def test_min_deployable_constant(self):
        self.assertEqual(MIN_DEPLOYABLE_USD_FOR_ORDER_SEARCH, 1.0)

    def test_open_position_limit_blocks_at_cap(self):
        settings = type("S", (), {"bot_max_open_positions": 3})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=500.0,
            open_position_count=3,
        )
        self.assertFalse(active)
        self.assertEqual(label, "At open position limit (3/3)")

    def test_open_position_limit_allows_below_cap(self):
        settings = type("S", (), {"bot_max_open_positions": 30})()
        active, label = compute_order_search_scan_labels(
            "play",
            settings,
            100.0,
            total_portfolio_value_usd=500.0,
            open_position_count=29,
        )
        self.assertTrue(active)
        self.assertIn("searching for new positions", label)
