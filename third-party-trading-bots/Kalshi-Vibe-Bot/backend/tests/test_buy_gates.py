"""Buy-side AI probability floor and baked contrarian buy tier."""

import unittest

from src.decision_engine.strategy_math import (
    ai_win_prob_pct_on_buy_side,
    contrarian_buy_tier_active,
    effective_buy_gate_thresholds,
)


class TestBuyGates(unittest.TestCase):
    def test_ai_win_prob_on_buy_side(self):
        self.assertEqual(ai_win_prob_pct_on_buy_side("YES", 45), 45)
        self.assertEqual(ai_win_prob_pct_on_buy_side("NO", 45), 55)

    def test_contrarian_tier_false_when_gap_below_baked_threshold(self):
        self.assertFalse(
            contrarian_buy_tier_active(
                side="YES",
                ai_yes_pct=29,
                yes_ask=0.15,
                no_ask=0.86,
                yes_mid=0.15,
                no_mid=0.86,
            )
        )

    def test_contrarian_tier_active_low_implied_large_gap(self):
        self.assertTrue(
            contrarian_buy_tier_active(
                side="YES",
                ai_yes_pct=40,
                yes_ask=0.15,
                no_ask=0.86,
                yes_mid=0.15,
                no_mid=0.86,
            )
        )

    def test_effective_thresholds_raise_under_contrarian(self):
        eff_e, eff_ai, tier = effective_buy_gate_thresholds(
            side="YES",
            ai_yes_pct=40,
            yes_ask=0.15,
            no_ask=0.86,
            yes_mid=0.15,
            no_mid=0.86,
            min_edge_base=1.0,
            min_ai_win_prob_base=51,
        )
        self.assertTrue(tier)
        self.assertEqual(eff_e, 6.0)
        self.assertEqual(eff_ai, 55)

    def test_effective_thresholds_normal_when_not_contrarian(self):
        eff_e, eff_ai, tier = effective_buy_gate_thresholds(
            side="YES",
            ai_yes_pct=55,
            yes_ask=0.50,
            no_ask=0.52,
            yes_mid=0.50,
            no_mid=0.52,
            min_edge_base=1.0,
            min_ai_win_prob_base=51,
        )
        self.assertFalse(tier)
        self.assertEqual(eff_e, 1.0)
        self.assertEqual(eff_ai, 51)


if __name__ == "__main__":
    unittest.main()
