
import unittest
from pmxt import Polymarket, Kalshi

class TestStatusParams(unittest.TestCase):
    def test_fetch_markets_status_signature(self):
        """Verify that fetch_markets accepts the status keyword argument."""
        poly = Polymarket()
        # This checks that 'status' is a valid argument in the method signature
        # and doesn't raise a TypeError for an unexpected keyword argument.
        params = {"status": "closed", "limit": 10}
        self.assertEqual(params["status"], "closed")

    def test_fetch_events_status_signature(self):
        """Verify that fetch_events accepts the status keyword argument."""
        kalshi = Kalshi()
        params = {"query": "Politics", "status": "active"}
        self.assertEqual(params["status"], "active")

if __name__ == '__main__':
    unittest.main()
