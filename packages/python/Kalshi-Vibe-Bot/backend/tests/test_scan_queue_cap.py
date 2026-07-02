"""Volume-priority cap for scan queue units."""

import unittest

from src.bot.loop import _cap_scan_queue_units_by_volume, _max_leg_volume_scan_unit


class TestScanQueueCap(unittest.TestCase):
    def test_cap_keeps_highest_volume_units(self):
        q = [
            ("single", "EV", [{"id": "A", "volume": 100.0}]),
            ("single", "EV", [{"id": "B", "volume": 900.0}]),
            ("batch", "EV2", [{"id": "C", "volume": 500.0}, {"id": "D", "volume": 50.0}]),
        ]
        out = _cap_scan_queue_units_by_volume(q, 2)
        self.assertEqual(len(out), 2)
        # B alone max 900; batch max 500 — A (100) dropped.
        all_ids = {m.get("id") for u in out for m in u[2]}
        self.assertEqual(all_ids, {"B", "C", "D"})

    def test_max_leg_volume(self):
        self.assertEqual(
            _max_leg_volume_scan_unit([{"volume": 3}, {"volume": 10}]),
            10.0,
        )


if __name__ == "__main__":
    unittest.main()
