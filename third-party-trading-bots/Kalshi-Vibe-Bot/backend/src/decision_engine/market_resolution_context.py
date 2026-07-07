"""Build authoritative settlement wording for AI prompts (avoids exact-hit misreads)."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

# Kalshi short-dated crypto up/down series (15m, etc.) — subtitle "Target Price" is a threshold, not a point hit.
_CRYPTO_THRESHOLD_SERIES_PREFIXES = (
    "KXETH15M",
    "KXBTC15M",
    "KXSOL15M",
    "KXETH",
    "KXBTC",
)


def _optional_float(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        f = float(v)
        return f if f == f else None  # NaN
    except (TypeError, ValueError):
        return None


def _fmt_strike(v: Optional[float]) -> str:
    if v is None:
        return "the stated threshold"
    x = float(v)
    if abs(x) >= 100:
        return f"${x:,.2f}"
    if abs(x) >= 1:
        return f"${x:.2f}"
    return f"{x:.4f}"


def _extract_dollar_threshold_from_text(*chunks: str) -> Optional[str]:
    for text in chunks:
        if not text:
            continue
        m = re.search(
            r"(?:target\s+price|threshold|strike|above|below|at)\s*:?\s*\$?\s*([\d,]+(?:\.\d+)?)",
            text,
            re.IGNORECASE,
        )
        if m:
            return m.group(1).replace(",", "")
        m2 = re.search(r"\$\s*([\d,]+(?:\.\d+)?)\s*target", text, re.IGNORECASE)
        if m2:
            return m2.group(1).replace(",", "")
    return None


def _is_crypto_short_threshold_market(market: Dict[str, Any]) -> bool:
    mid = str(market.get("id") or market.get("ticker") or "").upper()
    series = str(market.get("series_ticker") or "").upper()
    et = str(market.get("event_ticker") or "").upper()
    for prefix in _CRYPTO_THRESHOLD_SERIES_PREFIXES:
        if mid.startswith(prefix) or series.startswith(prefix) or et.startswith(prefix):
            return True
    blob = " ".join(
        str(market.get(k) or "")
        for k in ("title", "subtitle", "yes_sub_title", "no_sub_title")
    ).lower()
    if "15 min" in blob or "15m" in blob or "15-min" in blob:
        if any(x in blob for x in ("eth", "btc", "sol", "crypto", "price up", "up or down")):
            return True
    return False


def _strike_type_sentence(
    strike_type: str,
    *,
    floor_strike: Optional[float],
    cap_strike: Optional[float],
) -> str:
    st = (strike_type or "").strip().lower()
    floor_s = _fmt_strike(floor_strike)
    cap_s = _fmt_strike(cap_strike)
    if st == "greater":
        return (
            f"YES if the official expiration/index value is **strictly greater than** {floor_s}; "
            f"NO if it is at or below {floor_s}."
        )
    if st == "greater_or_equal":
        return (
            f"YES if the official expiration/index value is **greater than or equal to** {floor_s}; "
            f"NO if it is below {floor_s}."
        )
    if st == "less":
        return (
            f"YES if the official expiration/index value is **strictly less than** {floor_s}; "
            f"NO if it is at or above {floor_s}."
        )
    if st == "less_or_equal":
        return (
            f"YES if the official expiration/index value is **less than or equal to** {floor_s}; "
            f"NO if it is above {floor_s}."
        )
    if st == "between":
        return (
            f"YES if the official expiration/index value is **between** {floor_s} and {cap_s} "
            f"(per Kalshi rules); otherwise NO."
        )
    return ""


def format_kalshi_resolution_block(market: Dict[str, Any]) -> str:
    """Plain-language settlement rules for LLM prompts (empty when nothing to add)."""
    parts: List[str] = []

    rules_p = str(market.get("rules_primary") or "").strip()
    rules_s = str(market.get("rules_secondary") or "").strip()
    if rules_p:
        parts.append(f"Kalshi rules (primary): {rules_p}")
    if rules_s:
        parts.append(f"Kalshi rules (secondary): {rules_s}")

    strike_type = str(market.get("strike_type") or "").strip().lower()
    floor_strike = _optional_float(market.get("floor_strike"))
    cap_strike = _optional_float(market.get("cap_strike"))
    strike_line = _strike_type_sentence(
        strike_type, floor_strike=floor_strike, cap_strike=cap_strike
    )
    if strike_line:
        parts.append(strike_line)

    if not strike_line and _is_crypto_short_threshold_market(market):
        thr = _extract_dollar_threshold_from_text(
            str(market.get("subtitle") or ""),
            str(market.get("title") or ""),
            str(market.get("yes_sub_title") or ""),
        )
        thr_disp = f"${thr}" if thr else "the stated target/threshold"
        parts.append(
            f"This is a **directional threshold** market (e.g. ETH/BTC up vs down over ~15 minutes), "
            f"**not** an exact-price 'hit {thr_disp}' contract. "
            f"YES typically means the index is **above** {thr_disp} at resolution; NO means **at or below** "
            f"{thr_disp}. Do **not** treat 'target price' as requiring the index to land exactly on that number."
        )

    if not parts:
        return ""

    return (
        "RESOLUTION (authoritative — use this; do not infer 'exact hit' from 'target price' wording alone):\n"
        + "\n".join(f"• {p}" for p in parts)
    )


def enrich_ai_market_description(base_description: str, market: Dict[str, Any]) -> str:
    """Prepend settlement rules to the subtitle/title description sent to the LLM."""
    base = (base_description or "").strip()
    block = format_kalshi_resolution_block(market)
    if not block:
        return base
    if base:
        return f"{block}\n\n{base}"
    return block
