"""Tests for xAI prepaid remaining from postpaid invoice preview (Management API)."""

import unittest

from src.clients.xai_client import prepaid_remaining_usd_from_invoice_preview_json


class TestPrepaidFromInvoicePreview(unittest.TestCase):
    def test_live_shape_may_2026(self):
        data = {
            "coreInvoice": {
                "totalWithCorr": {"val": "1373"},
                "prepaidCredits": {"val": "-3816"},
                "prepaidCreditsUsed": {"val": "-1373"},
            },
            "billingCycle": {"year": 2026, "month": 5},
        }
        usd = prepaid_remaining_usd_from_invoice_preview_json(data)
        self.assertAlmostEqual(usd, 24.43, places=2)

    def test_doc_style_negative_credits_only(self):
        data = {
            "coreInvoice": {
                "prepaidCredits": {"val": "-4500"},
                "prepaidCreditsUsed": {"val": "0"},
            }
        }
        usd = prepaid_remaining_usd_from_invoice_preview_json(data)
        self.assertAlmostEqual(usd, 45.0, places=2)

    def test_missing_core_invoice(self):
        self.assertIsNone(prepaid_remaining_usd_from_invoice_preview_json({}))
        self.assertIsNone(prepaid_remaining_usd_from_invoice_preview_json({"coreInvoice": {}}))


if __name__ == "__main__":
    unittest.main()
