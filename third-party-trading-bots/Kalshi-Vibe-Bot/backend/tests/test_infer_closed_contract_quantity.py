"""``infer_closed_contract_quantity`` — fractional lots and cost/avg fallback."""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.reconcile.open_positions import infer_closed_contract_quantity  # noqa: E402


class TestInferClosedContractQuantity(unittest.TestCase):
    def test_uses_positive_stored_quantity(self):
        pos = SimpleNamespace(
            quantity=5,
            entry_cost=0.01,
            entry_price=0.1111,
            current_price=0.0,
            realized_pnl=0.0,
        )
        self.assertEqual(infer_closed_contract_quantity(pos), 5)

    def test_integer_like_from_cost_over_avg(self):
        pos = SimpleNamespace(
            quantity=0.0,
            entry_cost=100.5,
            entry_price=1.005,
            current_price=0.0,
            realized_pnl=0.0,
        )
        self.assertEqual(infer_closed_contract_quantity(pos), 100)

    def test_sub_contract_ratio_floors_to_zero_whole_contracts(self):
        pos = SimpleNamespace(
            quantity=0,
            entry_cost=0.01,
            entry_price=0.111111,
            current_price=0.0,
            realized_pnl=0.0,
        )
        self.assertEqual(infer_closed_contract_quantity(pos), 0)

    def test_zero_when_no_basis(self):
        pos = SimpleNamespace(
            quantity=0.0,
            entry_cost=0.0,
            entry_price=1.005,
            current_price=0.0,
            realized_pnl=0.0,
        )
        self.assertEqual(infer_closed_contract_quantity(pos), 0.0)


if __name__ == "__main__":
    unittest.main()
