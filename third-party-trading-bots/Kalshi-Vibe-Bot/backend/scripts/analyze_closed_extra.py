"""Supplementary category breakdown for closed trades. Prefer analyze_closed_performance.py for full reports."""
import sqlite3
from collections import defaultdict
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "trading_bot.db"
conn = sqlite3.connect(DB)


def cat(t: str) -> str:
    t = (t or "").lower()
    if " vs " in t or "total goals" in t or "btts" in t or "total maps" in t:
        return "sports"
    if "bitcoin" in t or "ethereum" in t or "price on" in t:
        return "crypto"
    if "temperature" in t or "high temp" in t:
        return "weather"
    return "other"


def summarize(pnls):
    if not pnls:
        return {}
    return {
        "n": len(pnls),
        "pnl": round(sum(pnls), 2),
        "wr": round(100 * sum(1 for x in pnls if x > 0) / len(pnls), 1),
    }


cats = defaultdict(list)
for pnl, fees, title in conn.execute(
    "SELECT realized_pnl, fees_paid, market_title FROM positions WHERE status='closed'"
):
    cats[cat(title)].append(float(pnl or 0) - float(fees or 0))

print("=== CATEGORY PNL ===")
for c, v in sorted(cats.items(), key=lambda x: -len(x[1])):
    print(c, summarize(v))

# stop loss
won = lose = unk = 0
sl_pnls = []
for side, res, pnl, fees in conn.execute(
    """SELECT side, kalshi_market_result, realized_pnl, fees_paid FROM positions
       WHERE status='closed' AND exit_reason='stop_loss'"""
):
    sl_pnls.append(float(pnl or 0) - float(fees or 0))
    r = (res or "").lower()
    s = (side or "").upper()
    if r not in ("yes", "no"):
        unk += 1
        continue
    w = (s == "YES" and r == "yes") or (s == "NO" and r == "no")
    if w:
        won += 1
    else:
        lose += 1
print("=== STOP LOSS ===", summarize(sl_pnls), "settle_win", won, "settle_lose", lose, "unk", unk)

# AI 75+ with entry price buckets
buckets = defaultdict(list)
for pnl, fees, ep, ai_yes, side, edge in conn.execute(
    """SELECT p.realized_pnl, p.fees_paid, p.entry_price, d.ai_probability_yes_pct, p.side, d.edge
       FROM positions p JOIN decision_logs d ON d.id=p.entry_decision_log_id
       WHERE p.status='closed' AND d.ai_probability_yes_pct IS NOT NULL"""
):
    asp = int(ai_yes) if side.upper() == "YES" else 100 - int(ai_yes)
    if asp >= 75:
        c = int(float(ep or 0) * 100)
        key = "cheap<=40c" if c <= 40 else "mid41-65" if c <= 65 else "fav66+"
        buckets[key].append(float(pnl or 0) - float(fees or 0))
print("=== AI 75+ BY ENTRY PRICE ===")
for k, v in buckets.items():
    print(k, summarize(v))

# tuning
for row in conn.execute("SELECT trade_mode, min_edge_to_buy_pct, min_ai_win_prob_buy_side_pct, stop_loss_drawdown_pct, stop_loss_selling_enabled, ai_provider FROM tuning_state"):
    print("tuning:", row)

conn.close()
