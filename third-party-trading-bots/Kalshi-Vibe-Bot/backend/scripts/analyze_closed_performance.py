#!/usr/bin/env python3
"""One-off closed-position + AI analysis performance study (reads trading_bot.db only)."""

from __future__ import annotations

import json
import sqlite3
import statistics
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

DB_PATH = _BACKEND / "trading_bot.db"


def _parse_json(s: Optional[str]) -> Any:
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        return None


def _won(side: str, result: str) -> Optional[bool]:
    s = (side or "").upper()
    r = (result or "").lower()
    if r not in ("yes", "no"):
        return None
    if s == "YES":
        return r == "yes"
    if s == "NO":
        return r == "no"
    return None


@dataclass
class ClosedRow:
    id: str
    market_id: str
    market_title: str
    side: str
    quantity: int
    entry_price: float
    entry_cost: float
    realized_pnl: float
    fees_paid: float
    exit_reason: Optional[str]
    trade_mode: str
    opened_at: Optional[str]
    closed_at: Optional[str]
    kalshi_market_result: Optional[str]
    # decision log
    decision: Optional[str]
    edge: Optional[float]
    ai_yes: Optional[int]
    m_impl: Optional[int]
    kelly: Optional[int]
    escalated: bool
    xai: Dict[str, Any]
    reasoning: str


def load_rows(conn: sqlite3.Connection) -> List[ClosedRow]:
    q = """
    SELECT
        p.id, p.market_id, p.market_title, p.side, p.quantity, p.entry_price, p.entry_cost,
        p.realized_pnl, p.fees_paid, p.exit_reason, p.trade_mode,
        p.opened_at, p.closed_at, p.kalshi_market_result, p.entry_decision_log_id,
        d.decision, d.edge, d.ai_probability_yes_pct, d.market_implied_probability_pct,
        d.kelly_contracts, d.escalated_to_xai, d.xai_analysis, d.reasoning
    FROM positions p
    LEFT JOIN decision_logs d ON d.id = p.entry_decision_log_id
    WHERE p.status = 'closed'
    ORDER BY p.closed_at
    """
    rows: List[ClosedRow] = []
    for r in conn.execute(q):
        xai = _parse_json(r[19]) or {}
        rows.append(
            ClosedRow(
                id=r[0],
                market_id=r[1] or "",
                market_title=r[2] or "",
                side=(r[3] or "").upper(),
                quantity=int(r[4] or 0),
                entry_price=float(r[5] or 0),
                entry_cost=float(r[6] or 0),
                realized_pnl=float(r[7] or 0),
                fees_paid=float(r[8] or 0),
                exit_reason=r[9],
                trade_mode=r[10] or "paper",
                opened_at=r[11],
                closed_at=r[12],
                kalshi_market_result=r[13],
                decision=r[15],
                edge=float(r[16]) if r[16] is not None else None,
                ai_yes=int(r[17]) if r[17] is not None else None,
                m_impl=int(r[18]) if r[18] is not None else None,
                kelly=int(r[19]) if False else (int(r[19]) if r[19] is not None else None),
                escalated=bool(r[20]),
                xai=xai if isinstance(xai, dict) else {},
                reasoning=(r[21] or "")[:500],
            )
        )
    # fix kelly index bug
    for i, r in enumerate(conn.execute(q)):
        pass
    return _load_rows_fixed(conn)


def _load_rows_fixed(conn: sqlite3.Connection) -> List[ClosedRow]:
    q = """
    SELECT
        p.id, p.market_id, p.market_title, p.side, p.quantity, p.entry_price, p.entry_cost,
        p.realized_pnl, p.fees_paid, p.exit_reason, p.trade_mode,
        p.opened_at, p.closed_at, p.kalshi_market_result,
        d.decision, d.edge, d.ai_probability_yes_pct, d.market_implied_probability_pct,
        d.kelly_contracts, d.escalated_to_xai, d.xai_analysis, d.reasoning
    FROM positions p
    LEFT JOIN decision_logs d ON d.id = p.entry_decision_log_id
    WHERE p.status = 'closed'
    ORDER BY p.closed_at
    """
    rows: List[ClosedRow] = []
    for r in conn.execute(q):
        xai = _parse_json(r[20]) or {}
        rows.append(
            ClosedRow(
                id=r[0],
                market_id=r[1] or "",
                market_title=r[2] or "",
                side=(r[3] or "").upper(),
                quantity=int(r[4] or 0),
                entry_price=float(r[5] or 0),
                entry_cost=float(r[6] or 0),
                realized_pnl=float(r[7] or 0),
                fees_paid=float(r[8] or 0),
                exit_reason=r[9],
                trade_mode=r[10] or "paper",
                opened_at=r[11],
                closed_at=r[12],
                kalshi_market_result=r[13],
                decision=r[14],
                edge=float(r[15]) if r[15] is not None else None,
                ai_yes=int(r[16]) if r[16] is not None else None,
                m_impl=int(r[17]) if r[17] is not None else None,
                kelly=int(r[18]) if r[18] is not None else None,
                escalated=bool(r[19]),
                xai=xai if isinstance(xai, dict) else {},
                reasoning=(r[21] or "")[:500],
            )
        )
    return rows


def ai_side_prob(row: ClosedRow) -> Optional[int]:
    if row.ai_yes is None:
        return None
    if row.side == "YES":
        return row.ai_yes
    if row.side == "NO":
        return 100 - row.ai_yes
    return None


def net_pnl(row: ClosedRow) -> float:
    return row.realized_pnl - row.fees_paid


def bucket_edge(e: Optional[float]) -> str:
    if e is None:
        return "unknown"
    if e < 3:
        return "<3"
    if e < 8:
        return "3-7"
    if e < 15:
        return "8-14"
    if e < 25:
        return "15-24"
    return "25+"


def bucket_ai(p: Optional[int]) -> str:
    if p is None:
        return "unknown"
    if p < 60:
        return "<60"
    if p < 65:
        return "60-64"
    if p < 70:
        return "65-69"
    if p < 75:
        return "70-74"
    return "75+"


def bucket_entry_px(px: float) -> str:
    c = px * 100
    if c <= 25:
        return "<=25c"
    if c <= 40:
        return "26-40¢"
    if c <= 55:
        return "41-55¢"
    if c <= 70:
        return "56-70¢"
    return "71¢+"


def summarize_group(name: str, items: List[ClosedRow]) -> Dict[str, Any]:
    if not items:
        return {"n": 0}
    pnls = [net_pnl(x) for x in items]
    wins = [x for x in items if _won(x.side, x.kalshi_market_result or "") is True]
    losses = [x for x in items if _won(x.side, x.kalshi_market_result or "") is False]
    unsettled = [x for x in items if _won(x.side, x.kalshi_market_result or "") is None]
    wr_known = len(wins) / (len(wins) + len(losses)) if (wins or losses) else None
    return {
        "n": len(items),
        "total_pnl": round(sum(pnls), 2),
        "avg_pnl": round(statistics.mean(pnls), 2),
        "med_pnl": round(statistics.median(pnls), 2),
        "win_rate": round(wr_known * 100, 1) if wr_known is not None else None,
        "wins": len(wins),
        "losses": len(losses),
        "unsettled": len(unsettled),
        "avg_win": round(statistics.mean([net_pnl(x) for x in wins]), 2) if wins else None,
        "avg_loss": round(statistics.mean([net_pnl(x) for x in losses]), 2) if losses else None,
    }


def main() -> None:
    if not DB_PATH.exists():
        print(f"No database at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    rows = _load_rows_fixed(conn)

    # decision logs stats
    dl_total = conn.execute("SELECT COUNT(*) FROM decision_logs").fetchone()[0]
    dl_exec = conn.execute(
        "SELECT COUNT(*) FROM decision_logs WHERE action_taken LIKE '%executed%'"
    ).fetchone()[0]

    settled = [r for r in rows if _won(r.side, r.kalshi_market_result or "") is not None]
    print("=== DATASET ===")
    print(f"closed_positions={len(rows)} settled_with_outcome={len(settled)}")
    print(f"decision_logs={dl_total} executed_actions={dl_exec}")

    for mode in ("paper", "live"):
        sub = [r for r in rows if r.trade_mode == mode]
        if not sub:
            continue
        print(f"\n=== MODE: {mode} ===")
        print(json.dumps(summarize_group(mode, sub), indent=2))

    print("\n=== EXIT REASON ===")
    by_exit: Dict[str, List[ClosedRow]] = defaultdict(list)
    for r in rows:
        by_exit[r.exit_reason or "unknown"].append(r)
    for k, v in sorted(by_exit.items(), key=lambda x: -len(x[1])):
        print(f"  {k}: {json.dumps(summarize_group(k, v))}")

    print("\n=== EDGE BUCKET (at entry) ===")
    by_edge: Dict[str, List[ClosedRow]] = defaultdict(list)
    for r in settled:
        by_edge[bucket_edge(r.edge)].append(r)
    for k in ["<3", "3-7", "8-14", "15-24", "25+", "unknown"]:
        if k in by_edge:
            print(f"  {k}: {json.dumps(summarize_group(k, by_edge[k]))}")

    print("\n=== AI WIN PROB ON BUY SIDE ===")
    by_ai: Dict[str, List[ClosedRow]] = defaultdict(list)
    for r in settled:
        by_ai[bucket_ai(ai_side_prob(r))].append(r)
    for k in ["<60", "60-64", "65-69", "70-74", "75+", "unknown"]:
        if k in by_ai:
            print(f"  {k}: {json.dumps(summarize_group(k, by_ai[k]))}")

    print("\n=== ENTRY PRICE (per contract) ===")
    by_px: Dict[str, List[ClosedRow]] = defaultdict(list)
    for r in settled:
        by_px[bucket_entry_px(r.entry_price)].append(r)
    for k in ["<=25c", "26-40c", "41-55c", "56-70c", "71c+"]:
        if k in by_px:
            print(f"  {k}: {json.dumps(summarize_group(k, by_px[k]))}")

    print("\n=== EVENT BATCH vs SINGLE ===")
    batch, single = [], []
    for r in settled:
        if r.xai.get("event_batch"):
            batch.append(r)
        else:
            single.append(r)
    print(f"  event_batch: {json.dumps(summarize_group('batch', batch))}")
    print(f"  single: {json.dumps(summarize_group('single', single))}")

    print("\n=== AI PROVIDER (from blob) ===")
    by_prov: Dict[str, List[ClosedRow]] = defaultdict(list)
    for r in settled:
        p = str(r.xai.get("provider") or "unknown").lower()
        by_prov[p].append(r)
    for k, v in by_prov.items():
        print(f"  {k}: {json.dumps(summarize_group(k, v))}")

    print("\n=== SIDE ===")
    for side in ("YES", "NO"):
        sub = [r for r in settled if r.side == side]
        print(f"  {side}: {json.dumps(summarize_group(side, sub))}")

    print("\n=== KELLY CONTRACTS AT ENTRY ===")
    by_k: Dict[str, List[ClosedRow]] = defaultdict(list)
    for r in settled:
        k = r.kelly if r.kelly is not None else -1
        by_k[str(k)].append(r)
    for k in sorted(by_k.keys(), key=lambda x: (x == "-1", int(x) if x.lstrip("-").isdigit() else 999)):
        print(f"  kelly={k}: {json.dumps(summarize_group(k, by_k[k]))}")

    # loss leaders
    print("\n=== TOP 10 LOSSES (net) ===")
    worst = sorted(rows, key=net_pnl)[:10]
    for r in worst:
        w = _won(r.side, r.kalshi_market_result or "")
        print(
            f"  ${net_pnl(r):.2f} | {r.side} @ {r.entry_price:.2f} | edge={r.edge} ai_side={ai_side_prob(r)} "
            f"| {r.exit_reason} | batch={bool(r.xai.get('event_batch'))} | {r.market_title[:60]}"
        )

    print("\n=== TOP 10 WINS (net) ===")
    best = sorted(rows, key=net_pnl, reverse=True)[:10]
    for r in best:
        print(
            f"  ${net_pnl(r):.2f} | {r.side} @ {r.entry_price:.2f} | edge={r.edge} ai_side={ai_side_prob(r)} "
            f"| {r.exit_reason} | {r.market_title[:60]}"
        )

    # stop loss vs hold to settlement
    sl = [r for r in rows if r.exit_reason == "stop_loss"]
    exp = [r for r in rows if r.exit_reason in ("expiration", None) or (r.exit_reason not in ("stop_loss", "manual", "counter_trend"))]
    print("\n=== STOP LOSS vs OTHER EXITS ===")
    print(f"  stop_loss: {json.dumps(summarize_group('sl', sl))}")
    non_sl = [r for r in rows if r.exit_reason != "stop_loss"]
    print(f"  non_stop_loss: {json.dumps(summarize_group('non', non_sl))}")

    # implied vs ai gap
    print("\n=== MARKET IMPLIED (buy side) vs AI SIDE GAP ===")
    gaps: List[tuple] = []
    for r in settled:
        asp = ai_side_prob(r)
        if asp is None or r.m_impl is None:
            continue
        gaps.append((asp - r.m_impl, r))
    if gaps:
        for label, lo, hi in [("ai-implied<5", -999, 5), ("5-14", 5, 15), ("15-24", 15, 25), ("25+", 25, 999)]:
            g = [r for d, r in gaps if lo <= d < hi]
            print(f"  gap {label}: {json.dumps(summarize_group(label, g))}")

    # volume at entry from snapshot in decision log - skip if not in row

    # contrarian: buy side implied <= 25 and edge >= 15
    contra, normal = [], []
    for r in settled:
        if r.m_impl is not None and r.m_impl <= 25 and (r.edge or 0) >= 15:
            contra.append(r)
        else:
            normal.append(r)
    print("\n=== CONTRARIAN-LIKE ENTRIES (impl≤25%, edge≥15) ===")
    print(f"  contra: {json.dumps(summarize_group('c', contra))}")
    print(f"  other: {json.dumps(summarize_group('o', normal))}")

    # title keywords
    print("\n=== MARKET TYPE HEURISTICS (title) ===")
    cats = {
        "sports": (" vs ", "game", "match", "wins", "total goals", "spread"),
        "weather": ("temperature", "high temp", "low temp", "rain", "snow"),
        "crypto": ("bitcoin", "btc", "eth", "crypto"),
        "politics": ("trump", "biden", "election", "president"),
    }
    by_cat: Dict[str, List[ClosedRow]] = defaultdict(list)
    other_cat: List[ClosedRow] = []
    for r in settled:
        t = r.market_title.lower()
        placed = False
        for cat, keys in cats.items():
            if any(k in t for k in keys):
                by_cat[cat].append(r)
                placed = True
                break
        if not placed:
            other_cat.append(r)
    for cat, items in sorted(by_cat.items(), key=lambda x: -len(x[1])):
        print(f"  {cat}: {json.dumps(summarize_group(cat, items))}")
    print(f"  other: {json.dumps(summarize_group('other', other_cat))}")

    conn.close()


if __name__ == "__main__":
    main()
