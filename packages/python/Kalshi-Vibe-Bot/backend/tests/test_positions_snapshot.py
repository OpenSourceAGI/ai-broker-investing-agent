"""DB-only open positions snapshot helper — no Kalshi HTTP."""

from __future__ import annotations

import unittest
import uuid
from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.api.portfolio import load_open_positions_snapshot_payload
from src.database.models import Base, DecisionLog, Position
from src.util.datetimes import utc_now


class TestPositionsSnapshot(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)

    def test_snapshot_returns_rows_matching_trade_mode(self):
        db = self.Session()
        try:
            oid = str(uuid.uuid4())
            db.add(
                Position(
                    id=oid,
                    market_id="KXTEST-1",
                    market_title="Test Market",
                    side="NO",
                    quantity=3,
                    entry_price=0.31,
                    entry_cost=0.93,
                    bid_price=0.34,
                    current_price=0.35,
                    unrealized_pnl=0.12,
                    status="open",
                    trade_mode="paper",
                    opened_at=utc_now(),
                )
            )
            db.commit()

            out = load_open_positions_snapshot_payload(db, "paper")
            self.assertEqual(len(out), 1)
            self.assertEqual(out[0]["id"], oid)
            self.assertEqual(out[0]["market_id"], "KXTEST-1")
            self.assertEqual(out[0]["side"], "NO")
            self.assertEqual(out[0]["quantity"], 3)
            self.assertAlmostEqual(out[0]["entry_price"], 0.31)
            self.assertAlmostEqual(out[0]["fees_paid"], 0.0)
            self.assertIn("opened_at", out[0])
            self.assertIn("awaiting_settlement", out[0])
            self.assertIn("dead_market", out[0])
            self.assertFalse(out[0]["dead_market"])
            self.assertIn("bid_price", out[0])
            self.assertAlmostEqual(float(out[0]["bid_price"] or 0.0), 0.34)
            self.assertIn("estimated_price", out[0])
            self.assertAlmostEqual(float(out[0]["estimated_price"] or 0.0), 0.34)
            self.assertFalse(out[0]["resolution_outcome_pending"])
            self.assertFalse(out[0]["resolution_awaiting_payout"])
            self.assertFalse(out[0]["resolution_kalshi_payout_complete"])
            self.assertIn("ends_at_contract_fallback", out[0])
            self.assertFalse(out[0]["ends_at_contract_fallback"])
        finally:
            db.close()

    def test_entry_decision_log_pins_entry_analysis_not_latest_ticker_log(self):
        """Open-leg snapshot uses ``entry_decision_log_id``, not the newest ``DecisionLog`` for that ticker."""
        db = self.Session()
        try:
            mid = "KXENTRYPIN-1"
            log_entry = "decision-entry-aa"
            log_later = "decision-later-bb"
            t0 = utc_now()
            db.add_all(
                [
                    DecisionLog(
                        id=log_entry,
                        market_id=mid,
                        market_title="Entry snapshot",
                        decision="BUY_NO",
                        confidence=0.72,
                        ai_probability_yes_pct=20,
                        trade_mode="paper",
                        timestamp=t0 - timedelta(hours=1),
                    ),
                    DecisionLog(
                        id=log_later,
                        market_id=mid,
                        market_title="Later scan",
                        decision="SKIP",
                        confidence=0.1,
                        ai_probability_yes_pct=88,
                        trade_mode="paper",
                        timestamp=t0,
                    ),
                    Position(
                        id=str(uuid.uuid4()),
                        market_id=mid,
                        market_title="Held leg",
                        side="NO",
                        quantity=2,
                        entry_price=0.4,
                        entry_cost=0.8,
                        bid_price=0.41,
                        current_price=0.42,
                        unrealized_pnl=0.01,
                        status="open",
                        trade_mode="paper",
                        opened_at=t0 - timedelta(minutes=30),
                        entry_decision_log_id=log_entry,
                    ),
                ]
            )
            db.commit()

            out = load_open_positions_snapshot_payload(db, "paper")
            self.assertEqual(len(out), 1)
            self.assertEqual(out[0]["entry_decision_log_id"], log_entry)
            self.assertIn("entry_analysis", out[0])
            self.assertEqual(out[0]["entry_analysis"]["decision_id"], log_entry)
            self.assertEqual(out[0]["entry_analysis"]["ai_probability_yes_pct"], 20)
            self.assertEqual(out[0]["entry_analysis"]["decision"], "BUY_NO")
        finally:
            db.close()

    def test_filters_other_trade_mode(self):
        db = self.Session()
        try:
            pid_live = str(uuid.uuid4())
            pid_paper = str(uuid.uuid4())
            now = utc_now()
            db.add_all(
                [
                    Position(
                        id=pid_live,
                        market_id="KXA",
                        market_title="Live leg",
                        side="YES",
                        quantity=1,
                        entry_price=0.5,
                        entry_cost=0.5,
                        current_price=0.5,
                        unrealized_pnl=0.0,
                        status="open",
                        trade_mode="live",
                        opened_at=now,
                    ),
                    Position(
                        id=pid_paper,
                        market_id="KXB",
                        market_title="Paper leg",
                        side="YES",
                        quantity=2,
                        entry_price=0.5,
                        entry_cost=1.0,
                        current_price=0.5,
                        unrealized_pnl=0.0,
                        status="open",
                        trade_mode="paper",
                        opened_at=now,
                    ),
                ]
            )
            db.commit()
            paper_only = load_open_positions_snapshot_payload(db, "paper")
            self.assertEqual(len(paper_only), 1)
            self.assertEqual(paper_only[0]["id"], pid_paper)
        finally:
            db.close()
