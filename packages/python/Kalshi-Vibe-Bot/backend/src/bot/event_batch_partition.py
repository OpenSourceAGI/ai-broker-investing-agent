"""
Partition markets under one Kalshi ``event_ticker`` into xAI event-batch groups.

Kalshi often puts many unrelated props (e.g. different pitchers' K lines) under one event.
Those must **not** be batched as a single mutually-exclusive outcome set. True partitions
(e.g. soccer home / away / tie) are usually short outcome codes on the same event prefix.
Daily **high / low** temperature brackets (``B88.5``, ``T93``, …) share one event ticker but
only one bin can resolve YES — they are grouped as ``exclusive_bins:`` so xAI compares siblings
in one call (same as ``codes:`` for 1X2).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Tuple

from src.reconcile.open_positions import normalize_market_id

# Tail after event ticker: ``PLAYERCODE-7`` (strikeout/point line) → bucket per player stem.
_TAIL_LINE_LADDER = re.compile(r"^(.+)-(\d{1,4})$")
# Single outcome token (BAH, CR, TIE, …) — grouped so 1X2-style legs batch together.
_TAIL_OUTCOME_CODE = re.compile(r"^[A-Z0-9]{1,20}$")
# High/low temp (and similar) bins: ``B88.5`` (range bucket), ``T93`` (threshold) — mutually exclusive.
_TAIL_EXCLUSIVE_BIN = re.compile(r"^[BT][0-9]+(?:\.5)?$", re.IGNORECASE)
# Series where sibling bins under one ``event_ticker`` resolve to at most one YES.
_EXCLUSIVE_BIN_EVENT_PREFIXES = ("KXHIGH", "KXLOW")

# Fixed cap (not env): line-ladder batches send at most this many legs to xAI after local rank.
LINE_LADDER_MAX_LEGS_FOR_XAI = 3


def event_batch_partition_key(market_id: str, event_ticker: str) -> str:
    """
    Stable bucket for batching legs under the same ``event_ticker``.

    - ``ladder:<stem>`` — numeric line props sharing ``stem`` (e.g. same pitcher's K thresholds).
    - ``codes:`` — single-token tails (typical match-winner / tie triplets).
    - ``exclusive_bins:`` — high/low temp style tails ``B*`` / ``T*`` under the same event (one YES max).
    - ``misc:<tail>`` — fallback per tail (avoids merging unrelated shapes).
    """
    mid = normalize_market_id(market_id).strip().upper()
    et = normalize_market_id(event_ticker).strip().upper()
    if not et:
        return f"misc:{mid}"
    if not mid.startswith(et):
        return f"misc:{mid}"
    tail = mid[len(et) :].lstrip("-").strip()
    if not tail:
        return "misc:empty"

    m = _TAIL_LINE_LADDER.fullmatch(tail)
    if m:
        stem, digits = m.group(1), m.group(2)
        if stem and digits.isdigit():
            return f"ladder:{stem.upper()}"

    et_upper = et.strip().upper()
    if any(et_upper.startswith(p) for p in _EXCLUSIVE_BIN_EVENT_PREFIXES):
        if _TAIL_EXCLUSIVE_BIN.fullmatch(tail):
            return "exclusive_bins:"

    if _TAIL_OUTCOME_CODE.fullmatch(tail):
        return "codes:"

    return f"misc:{tail.upper()}"


def group_markets_by_event_batch_partition(members: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """Group ``members`` (same event) by :func:`event_batch_partition_key`."""
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    if not members:
        return buckets
    et = (members[0].get("event_ticker") or "").strip().upper()
    for m in members:
        mid = str(m.get("id") or "")
        k = event_batch_partition_key(mid, et)
        buckets.setdefault(k, []).append(m)
    return buckets


def legs_are_all_line_ladder_partition(legs: List[Dict[str, Any]]) -> bool:
    """True if every leg is a ``ladder:…`` bucket (numeric threshold family)."""
    if not legs:
        return False
    et = (legs[0].get("event_ticker") or "").strip().upper()
    for leg in legs:
        mid = str(leg.get("market_id") or "")
        pk = event_batch_partition_key(mid, et)
        if not pk.startswith("ladder:"):
            return False
    return True


def is_line_ladder_cluster_batch(members: List[Dict[str, Any]], event_ticker: str) -> bool:
    """True when all rows share one ``ladder:…`` partition (same stem numeric lines)."""
    if len(members) < 2:
        return False
    et = (event_ticker or "").strip().upper()
    keys: List[str] = []
    for m in members:
        mid = str(m.get("id") or "")
        keys.append(event_batch_partition_key(mid, et))
    if len(set(keys)) != 1:
        return False
    return keys[0].startswith("ladder:")


def ladder_line_threshold_value(market_id: str, event_ticker: str) -> int:
    """Numeric suffix on a ladder tail (e.g. K line); tie-break for local ranking."""
    mid = normalize_market_id(market_id).strip().upper()
    et = normalize_market_id(event_ticker).strip().upper()
    if not et or not mid.startswith(et):
        return 0
    tail = mid[len(et) :].lstrip("-").strip()
    m = _TAIL_LINE_LADDER.fullmatch(tail)
    if not m:
        return 0
    try:
        return int(m.group(2))
    except ValueError:
        return 0


def ladder_local_xai_score(market_row: Dict[str, Any]) -> float:
    """Server-side rank for which ladder legs deserve xAI (volume, depth, tight spread)."""
    vol = float(market_row.get("volume") or 0.0)
    yas = float(market_row.get("yes_ask_size") or 0.0)
    nas = float(market_row.get("no_ask_size") or 0.0)
    depth = max(yas, nas)
    ys = float(market_row.get("yes_spread") or 1.0)
    ns = float(market_row.get("no_spread") or 1.0)
    min_spread = min(ys, ns) if ys > 0 and ns > 0 else min(ys or 1.0, ns or 1.0)
    tight = max(0.0, 0.25 - min_spread) * 5000.0
    return vol + depth * 12.0 + tight


def shortlist_line_ladder_members_for_xai(
    members: List[Dict[str, Any]],
    event_ticker: str,
    max_legs: int,
) -> Tuple[List[Dict[str, Any]], int, List[str]]:
    """Trim **line-ladder** batches to top ``max_legs`` by local score; never trim ``codes:``,
    ``exclusive_bins:``, or ``misc:``.

    The scan loop passes ``LINE_LADDER_MAX_LEGS_FOR_XAI`` (fixed, not from ``.env``) so xAI sees at most
    that many legs per numeric-line cluster; soccer-style ``codes:`` / temp ``exclusive_bins:`` batches stay intact.

    Returns ``(kept_members, n_trimmed, dropped_raw_ids)``.
    """
    original_n = len(members)
    if max_legs <= 0 or len(members) <= max_legs:
        return members, 0, []
    if not is_line_ladder_cluster_batch(members, event_ticker):
        return members, 0, []
    et = (event_ticker or "").strip().upper()
    ranked = sorted(
        members,
        key=lambda m: (
            -ladder_local_xai_score(m),
            -ladder_line_threshold_value(str(m.get("id") or ""), et),
            normalize_market_id(str(m.get("id") or "")).upper(),
        ),
    )
    kept = ranked[:max_legs]
    kept_norm = {normalize_market_id(str(m.get("id") or "")).upper() for m in kept}
    dropped_raw: List[str] = []
    for m in members:
        nid = normalize_market_id(str(m.get("id") or "")).upper()
        if nid and nid not in kept_norm:
            raw = str(m.get("id") or "").strip()
            if raw:
                dropped_raw.append(raw)
    return kept, original_n - len(kept), dropped_raw
