"""Cooldown helpers so event-batch xAI runs debounce the right sibling set."""

import unittest

from src.bot.loop import (
    _cooldown_market_ids_from_event_batch_xai_jsons,
    _event_tickers_from_event_batch_xai_json,
    _tradeable_market_ids_for_event_tickers,
    _tradeable_scan_queue,
)


class TestBatchEventCooldown(unittest.TestCase):
    def test_parses_event_ticker_from_batch_log(self):
        et = _event_tickers_from_event_batch_xai_json(
            [
                '{"event_batch": true, "event_ticker": "KXBTC-25MAY05-5PM"}',
            ]
        )
        self.assertEqual(et, {"KXBTC-25MAY05-5PM"})

    def test_explicit_leg_ids_only(self):
        explicit, legacy = _cooldown_market_ids_from_event_batch_xai_jsons(
            [
                '{"event_batch": true, "event_ticker": "EV1", "event_batch_market_ids": ["M-A", "M-B"]}',
            ]
        )
        self.assertEqual(explicit, {"M-A", "M-B"})
        self.assertEqual(legacy, set())

    def test_ignores_non_batch(self):
        et = _event_tickers_from_event_batch_xai_json(
            ['{"event_batch": false, "event_ticker": "KXFOO"}']
        )
        self.assertEqual(et, set())

    def test_maps_tradeable_to_ids(self):
        tid = _tradeable_market_ids_for_event_tickers(
            [
                {"id": "M-A", "event_ticker": "EV1"},
                {"id": "M-B", "event_ticker": "EV1"},
                {"id": "M-C", "event_ticker": "EV2"},
            ],
            {"EV1"},
        )
        self.assertEqual(tid, {"M-A", "M-B"})

    def test_scan_queue_splits_line_props_by_player_stem(self):
        et = "KXMLBKS-26MAY131940SDMIL"
        tradeable = [
            {"id": f"{et}-MILJMISIOROWSKI32-12", "event_ticker": et},
            {"id": f"{et}-MILJMISIOROWSKI32-13", "event_ticker": et},
            {"id": f"{et}-SDMKING34-7", "event_ticker": et},
        ]
        q = _tradeable_scan_queue(tradeable)
        kinds = [u[0] for u in q]
        self.assertEqual(kinds, ["batch", "single"])
        self.assertEqual(q[0][1], et)
        self.assertEqual(q[1][1], et)
        self.assertEqual(len(q[0][2]), 2)
        self.assertEqual(len(q[1][2]), 1)


if __name__ == "__main__":
    unittest.main()
