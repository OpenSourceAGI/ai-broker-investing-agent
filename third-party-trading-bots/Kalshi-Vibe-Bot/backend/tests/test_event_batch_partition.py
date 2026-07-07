"""Kalshi event batch grouping: same-event props must not false-merge as 1X2 partitions."""

import unittest

from src.bot.event_batch_partition import (
    event_batch_partition_key,
    group_markets_by_event_batch_partition,
    legs_are_all_line_ladder_partition,
    shortlist_line_ladder_members_for_xai,
)


class TestEventBatchPartition(unittest.TestCase):
    def test_different_pitcher_k_lines_split(self):
        et = "KXMLBKS-26MAY131940SDMIL"
        k1 = event_batch_partition_key(
            "KXMLBKS-26MAY131940SDMIL-MILJMISIOROWSKI32-12",
            et,
        )
        k2 = event_batch_partition_key(
            "KXMLBKS-26MAY131940SDMIL-MILJMISIOROWSKI32-13",
            et,
        )
        k3 = event_batch_partition_key(
            "KXMLBKS-26MAY131940SDMIL-SDMKING34-7",
            et,
        )
        self.assertEqual(k1, "ladder:MILJMISIOROWSKI32")
        self.assertEqual(k2, "ladder:MILJMISIOROWSKI32")
        self.assertEqual(k3, "ladder:SDMKING34")
        self.assertEqual(len({k1, k2, k3}), 2)

    def test_same_pitcher_lines_same_bucket(self):
        et = "KXMLBKS-26MAY131940SDMIL"
        self.assertEqual(
            event_batch_partition_key("KXMLBKS-26MAY131940SDMIL-SDMKING34-5", et),
            "ladder:SDMKING34",
        )
        self.assertEqual(
            event_batch_partition_key("KXMLBKS-26MAY131940SDMIL-SDMKING34-7", et),
            "ladder:SDMKING34",
        )

    def test_soccer_outcome_codes_share_bucket(self):
        et = "KXCOPADOBRASILGAME-26MAY13CRBAH"
        self.assertEqual(event_batch_partition_key(f"{et}-BAH", et), "codes:")
        self.assertEqual(event_batch_partition_key(f"{et}-CR", et), "codes:")
        self.assertEqual(event_batch_partition_key(f"{et}-TIE", et), "codes:")

    def test_group_markets_mixed_pitchers(self):
        et = "KXMLBKS-26MAY131940SDMIL"
        members = [
            {"id": f"{et}-MILJMISIOROWSKI32-12", "event_ticker": et},
            {"id": f"{et}-SDMKING34-7", "event_ticker": et},
        ]
        parts = group_markets_by_event_batch_partition(members)
        self.assertEqual(len(parts), 2)

    def test_legs_all_line_ladder(self):
        et = "KX-EV"
        legs = [
            {"market_id": f"{et}-P-5", "event_ticker": et},
            {"market_id": f"{et}-P-7", "event_ticker": et},
        ]
        self.assertTrue(legs_are_all_line_ladder_partition(legs))
        legs2 = [
            {"market_id": f"{et}-P-5", "event_ticker": et},
            {"market_id": f"{et}-BAH", "event_ticker": et},
        ]
        self.assertFalse(legs_are_all_line_ladder_partition(legs2))

    def test_shortlist_ladder_keeps_top_by_volume(self):
        et = "KX-EV"
        members = [
            {"id": f"{et}-P-5", "event_ticker": et, "volume": 100.0, "yes_ask_size": 1, "no_ask_size": 1, "yes_spread": 0.1, "no_spread": 0.1},
            {"id": f"{et}-P-7", "event_ticker": et, "volume": 900.0, "yes_ask_size": 2, "no_ask_size": 2, "yes_spread": 0.1, "no_spread": 0.1},
            {"id": f"{et}-P-6", "event_ticker": et, "volume": 500.0, "yes_ask_size": 1, "no_ask_size": 1, "yes_spread": 0.1, "no_spread": 0.1},
        ]
        kept, n_trim, dropped = shortlist_line_ladder_members_for_xai(members, et, 2)
        self.assertEqual(n_trim, 1)
        self.assertEqual(len(kept), 2)
        self.assertEqual(len(dropped), 1)
        ids = {m["id"] for m in kept}
        self.assertIn(f"{et}-P-7", ids)
        self.assertNotIn(f"{et}-P-5", ids)

    def test_miami_high_temp_bins_share_exclusive_bucket(self):
        et = "KXHIGHMIA-26MAY14"
        k1 = event_batch_partition_key(f"{et}-B88.5", et)
        k2 = event_batch_partition_key(f"{et}-B90.5", et)
        k3 = event_batch_partition_key(f"{et}-T93", et)
        self.assertEqual(k1, "exclusive_bins:")
        self.assertEqual(k2, "exclusive_bins:")
        self.assertEqual(k3, "exclusive_bins:")
        members = [
            {"id": f"{et}-B88.5", "event_ticker": et},
            {"id": f"{et}-B90.5", "event_ticker": et},
            {"id": f"{et}-T93", "event_ticker": et},
        ]
        parts = group_markets_by_event_batch_partition(members)
        self.assertEqual(set(parts.keys()), {"exclusive_bins:"})
        self.assertEqual(len(parts["exclusive_bins:"]), 3)

    def test_exclusive_bins_not_used_for_non_temp_series(self):
        et = "KXOTHER-26MAY14"
        self.assertEqual(event_batch_partition_key(f"{et}-B90.5", et), "misc:B90.5")

    def test_shortlist_does_not_trim_exclusive_bins_batch(self):
        et = "KXHIGHMIA-26MAY14"
        members = [
            {"id": f"{et}-B88.5", "event_ticker": et, "volume": 1.0},
            {"id": f"{et}-T93", "event_ticker": et, "volume": 2.0},
            {"id": f"{et}-B90.5", "event_ticker": et, "volume": 3.0},
        ]
        kept, n_trim, dropped = shortlist_line_ladder_members_for_xai(members, et, 2)
        self.assertEqual(len(kept), 3)
        self.assertEqual(n_trim, 0)
        self.assertEqual(dropped, [])


if __name__ == "__main__":
    unittest.main()
