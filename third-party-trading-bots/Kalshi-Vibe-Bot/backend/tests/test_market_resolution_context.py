"""AI resolution context for Kalshi threshold markets."""

from src.decision_engine.market_resolution_context import (
    enrich_ai_market_description,
    format_kalshi_resolution_block,
)


def test_kxeth15m_subtitle_gets_threshold_not_exact_hit_block():
    market = {
        "id": "KXETH15M-26MAY171930-30",
        "event_ticker": "KXETH15M-26MAY171930",
        "title": "ETH 15 min - $2,172.59 target",
        "subtitle": "Target Price: $2,172.59",
    }
    block = format_kalshi_resolution_block(market)
    assert "not" in block.lower() and "exact" in block.lower()
    assert "2172.59" in block.replace(",", "")
    assert "above" in block.lower()


def test_strike_type_greater_from_api():
    market = {
        "id": "KXETH15M-TEST",
        "strike_type": "greater",
        "floor_strike": 2172.59,
        "rules_primary": "If ETH is above the strike at expiration, YES pays.",
    }
    block = format_kalshi_resolution_block(market)
    assert "strictly greater than" in block
    assert "2,172.59" in block
    assert "Kalshi rules (primary)" in block


def test_enrich_prepends_block_before_subtitle():
    market = {
        "id": "KXETH15M-26MAY171930-30",
        "subtitle": "Target Price: $2,172.59",
    }
    out = enrich_ai_market_description("Target Price: $2,172.59", market)
    assert out.startswith("RESOLUTION")
    assert "Target Price: $2,172.59" in out
