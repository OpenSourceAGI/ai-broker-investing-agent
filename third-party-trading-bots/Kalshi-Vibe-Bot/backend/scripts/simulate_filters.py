"""Simulate how autonomous + user gates would have affected historical closed trades."""
import sqlite3
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

from src.config import DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT, DEFAULT_MIN_EDGE_TO_BUY_PCT
from src.decision_engine.strategy_gates import (
    autonomous_buy_gate_failure,
    effective_min_edge_for_market,
)
from src.decision_engine.strategy_math import ai_win_prob_pct_on_buy_side

DB = _BACKEND / "trading_bot.db"
conn = sqlite3.connect(DB)

rows = []
for r in conn.execute(
    """
    SELECT p.realized_pnl-p.fees_paid, d.edge, d.ai_probability_yes_pct, p.side, p.entry_price,
           p.exit_reason, p.market_title
    FROM positions p
    JOIN decision_logs d ON d.id=p.entry_decision_log_id
    WHERE p.status='closed' AND p.trade_mode='live'
    """
):
    pnl, edge, ai_yes, side, ep, _exit_reason, title = r
    side_u = (side or "YES").upper()
    rows.append(
        {
            "pnl": float(pnl or 0),
            "edge": float(edge or 0),
            "ai_yes": int(ai_yes or 50),
            "side": side_u,
            "ep": float(ep or 0),
            "title": title or "",
        }
    )


def sim(name, fn):
    kept = [x for x in rows if fn(x)]
    skip = [x for x in rows if not fn(x)]
    print(
        name,
        f"kept={len(kept)} pnl={sum(x['pnl'] for x in kept):.2f}",
        f"skip={len(skip)} pnl_skip={sum(x['pnl'] for x in skip):.2f}",
    )


base_pnl = sum(x["pnl"] for x in rows)
print(f"baseline n={len(rows)} pnl={base_pnl:.2f}")


def production_gates(x):
    side = x["side"]
    ai_buy = ai_win_prob_pct_on_buy_side(side, x["ai_yes"])
    min_edge = effective_min_edge_for_market(DEFAULT_MIN_EDGE_TO_BUY_PCT, x["title"])
    if x["edge"] + 1e-9 < min_edge:
        return False
    if ai_buy < DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT:
        return False
    return autonomous_buy_gate_failure(
        side=side,
        ai_yes_pct=x["ai_yes"],
        edge_pct=x["edge"],
        entry_price_dollars=x["ep"],
    ) is None


sim("production_gates", production_gates)
sim("edge 6-22 only", lambda x: 6 <= x["edge"] <= 22)
sim("no edge 25+", lambda x: x["edge"] < 25)
sim(
    "no ai 75+ mid chalk",
    lambda x: not (
        ai_win_prob_pct_on_buy_side(x["side"], x["ai_yes"]) >= 75
        and 41 <= int(round(x["ep"] * 100)) <= 65
    ),
)
sim("no cheap entry", lambda x: int(round(x["ep"] * 100)) >= 26)

conn.close()
