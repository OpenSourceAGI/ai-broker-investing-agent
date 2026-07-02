"""Edge and Kelly helpers for binary contracts."""

import unittest

from src.decision_engine.strategy_math import (
    edge_pct_for_side,
    full_kelly_fraction_for_side,
    kelly_contracts_for_side,
    kelly_contracts_for_order,
    kelly_order_skip_summary,
    max_whole_contracts_for_cash,
)


class TestStrategyMath(unittest.TestCase):
    def test_edge_yes_favorable(self):
        e = edge_pct_for_side("YES", 70, 0.50, 0.50, 0.50, 0.50)
        self.assertAlmostEqual(e, 20.0, places=5)

    def test_kelly_zero_when_no_edge(self):
        f = full_kelly_fraction_for_side("YES", 50, 0.50, 0.50, 0.50, 0.50)
        self.assertEqual(f, 0.0)
        k = kelly_contracts_for_side(1000.0, "YES", 50, 0.50, 0.50, 0.50, 0.50)
        self.assertEqual(k, 0)

    def test_kelly_contracts_positive(self):
        k = kelly_contracts_for_side(1000.0, "YES", 80, 0.50, 0.50, 0.50, 0.50)
        self.assertGreater(k, 0)

    def test_max_whole_contracts_for_cash(self):
        self.assertEqual(max_whole_contracts_for_cash(13.03, 0.56), 23)
        self.assertEqual(max_whole_contracts_for_cash(0.55, 0.56), 0)

    def test_single_contract_retry_when_kelly_rounds_to_zero_but_edge(self):
        qty, tag = kelly_contracts_for_order(
            12.0,
            "YES",
            58,
            0.56,
            0.45,
            0.56,
            0.44,
            per_contract_premium=0.56,
        )
        self.assertEqual(tag, "single_contract_retry")
        self.assertEqual(qty, 1)

    def test_order_size_none_when_no_edge(self):
        qty, tag = kelly_contracts_for_order(
            100.0,
            "YES",
            50,
            0.56,
            0.45,
            0.56,
            0.44,
            per_contract_premium=0.56,
        )
        self.assertEqual(qty, 0)
        self.assertEqual(tag, "none")

    def test_kelly_capped_by_max_contracts(self):
        qty, tag = kelly_contracts_for_order(
            500.0,
            "YES",
            90,
            0.40,
            0.50,
            0.40,
            0.50,
            per_contract_premium=0.40,
            max_kelly_contracts=8,
        )
        self.assertLessEqual(qty, 8)
        self.assertGreater(qty, 0)

    def test_kelly_skip_summary_no_edge_at_ask(self):
        msg = kelly_order_skip_summary(
            100.0,
            "YES",
            70,
            0.70,
            0.30,
            0.70,
            0.30,
            per_contract_premium=0.70,
        )
        self.assertIsNotNone(msg)
        self.assertIn("no edge at ask", msg)
        self.assertIn("70%", msg)
        self.assertIn("70¢", msg)
        self.assertIn("+0.0", msg)

    def test_kelly_skip_summary_insufficient_cash(self):
        msg = kelly_order_skip_summary(
            0.30,
            "YES",
            80,
            0.50,
            0.50,
            0.50,
            0.50,
            per_contract_premium=0.50,
        )
        self.assertIsNotNone(msg)
        self.assertIn("Kelly size is zero", msg)
        self.assertNotIn("no edge at ask", msg)

    def test_single_contract_retry_respects_zero_cap(self):
        qty, tag = kelly_contracts_for_order(
            5.0,
            "YES",
            58,
            0.56,
            0.45,
            0.56,
            0.44,
            per_contract_premium=0.56,
            max_kelly_contracts=0,
        )
        self.assertEqual(qty, 0)
        self.assertEqual(tag, "none")

    def test_kelly_capped_when_premium_exceeds_ask_used_for_kelly(self):
        """Cap when Kelly uses a lower ask than the premium used for cash (e.g. IOC / slippage buffer)."""
        qty, tag = kelly_contracts_for_order(
            3.0,
            "YES",
            99,
            0.40,
            0.50,
            0.40,
            0.50,
            per_contract_premium=0.55,
        )
        self.assertEqual(tag, "cash_capped")
        self.assertEqual(qty, 5)


if __name__ == "__main__":
    unittest.main()
