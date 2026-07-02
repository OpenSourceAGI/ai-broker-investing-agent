"""
Live xAI compatibility checks (requires XAI_API_KEY in backend/.env).

Skipped automatically when the key is missing.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from src.clients.ai_json_parse import loads_json_object
from src.clients.xai_client import XAIClient, _parse_event_batch_json, _parse_json, aclose_shared_xai_http
from src.decision_engine.analyzer import DecisionEngine

_XAI_KEY = (os.environ.get("XAI_API_KEY") or "").strip()
pytestmark = pytest.mark.skipif(not _XAI_KEY, reason="XAI_API_KEY not set")

_SAMPLE_PRICES = {
    "yes": 0.45,
    "no": 0.55,
    "yes_bid": 0.44,
    "yes_ask": 0.46,
    "no_bid": 0.54,
    "no_ask": 0.56,
    "yes_ask_size": 10.0,
    "no_ask_size": 10.0,
}


def test_shared_parser_handles_xai_style_wrappers():
    """Parser used by xAI must accept markdown fences and leading prose."""
    wrapped = (
        "Here is my analysis:\n```json\n"
        '{"direction": "YES", "ai_probability_yes_pct": 62, '
        '"reasoning": "ok", "real_time_context": "none", '
        '"key_factors": ["a"], "evidence": []}\n```'
    )
    obj = loads_json_object(wrapped, log_label="xai_test")
    assert obj is not None
    assert obj["direction"] == "YES"
    assert obj["ai_probability_yes_pct"] == 62
    parsed = _parse_json(wrapped)
    assert "error" not in parsed
    assert parsed["direction"] == "YES"


async def _xai_live_suite():
    """Run all live xAI calls in one event loop (shared httpx client)."""
    client = XAIClient(api_key=_XAI_KEY, model=os.getenv("XAI_MODEL", "grok-3"))
    single = await client.analyze_market(
        market_title="Will Team A win the match?",
        market_description="Resolves YES if Team A wins at full time.",
        current_prices=_SAMPLE_PRICES,
        volume=5000.0,
        expires_in_days=1,
        temperature=0.1,
    )
    legs = [
        {
            "market_id": "XAI-LEG-A",
            "market_title": "Team A wins",
            "market_description": "",
            "current_prices": {
                "yes": 0.33,
                "no": 0.67,
                "yes_bid": 0.32,
                "yes_ask": 0.34,
                "no_bid": 0.66,
                "no_ask": 0.68,
                "yes_ask_size": 5,
                "no_ask_size": 5,
            },
            "volume": 1200.0,
            "expires_in_days": 1,
            "close_time": "",
        },
        {
            "market_id": "XAI-LEG-B",
            "market_title": "Team B wins",
            "market_description": "",
            "current_prices": {
                "yes": 0.33,
                "no": 0.67,
                "yes_bid": 0.32,
                "yes_ask": 0.34,
                "no_bid": 0.66,
                "no_ask": 0.68,
                "yes_ask_size": 5,
                "no_ask_size": 5,
            },
            "volume": 1100.0,
            "expires_in_days": 1,
            "close_time": "",
        },
        {
            "market_id": "XAI-LEG-C",
            "market_title": "Draw",
            "market_description": "",
            "current_prices": {
                "yes": 0.34,
                "no": 0.66,
                "yes_bid": 0.33,
                "yes_ask": 0.35,
                "no_bid": 0.65,
                "no_ask": 0.67,
                "yes_ask_size": 5,
                "no_ask_size": 5,
            },
            "volume": 900.0,
            "expires_in_days": 1,
            "close_time": "",
        },
    ]
    batch = await client.analyze_event_best_trade(
        event_ticker="XAI-COMPAT-TEST",
        event_title="Soccer match",
        legs=legs,
    )
    gemini_key = (os.environ.get("GEMINI_API_KEY") or "").strip() or "unused"
    engine = DecisionEngine(
        xai_api_key=_XAI_KEY,
        xai_model=os.getenv("XAI_MODEL", "grok-3"),
        gemini_api_key=gemini_key,
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        ai_provider="xai",
    )
    engine_row = await engine.analyze_market(
        market_id="XAI-ENGINE-1",
        market_title="Will Team A win?",
        market_description="Resolves YES if Team A wins.",
        current_prices=_SAMPLE_PRICES,
        volume=4000.0,
        expires_in_days=1,
    )
    await aclose_shared_xai_http()
    return single, batch, engine_row


def test_xai_live_api_suite():
    single, batch, engine_row = asyncio.run(_xai_live_suite())
    result = single
    assert result.get("provider") == "xai"
    assert "error" not in result, result.get("error")
    assert result.get("direction") in ("YES", "NO", "SKIP")
    assert 0 <= int(result.get("ai_probability_yes_pct", -1)) <= 100

    assert batch.get("provider") == "xai"
    assert "error" not in batch, batch.get("error")
    assert batch.get("best_market_id") in {"XAI-LEG-A", "XAI-LEG-B", "XAI-LEG-C"}
    assert batch.get("direction") in ("YES", "NO", "SKIP")

    decision = engine_row
    assert decision.get("escalated_to_xai") is True
    blob = decision.get("xai_analysis") or {}
    assert blob.get("provider") == "xai"
    assert "error" not in blob, blob.get("error")
    assert decision.get("decision") in ("BUY_YES", "BUY_NO", "SKIP")


def test_event_batch_parser_via_shared_json():
    allowed = {"A", "B"}
    content = (
        '{"best_market_id": "A", "direction": "YES", "ai_probability_yes_pct": 55, '
        '"reasoning": "test", "real_time_context": "n/a", "key_factors": [], "evidence": []}'
    )
    out = _parse_event_batch_json(content, allowed_ids=allowed, ladder_stat_line_batch=False)
    assert out.get("best_market_id") == "A"
    assert out.get("direction") == "YES"
    assert "error" not in out
