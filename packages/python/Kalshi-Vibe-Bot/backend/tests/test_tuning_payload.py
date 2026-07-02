"""Tuning API payload shape."""

from types import SimpleNamespace

from src.api.tuning import tuning_state_payload
from src.config import (
    DEFAULT_AI_PROVIDER,
    DEFAULT_MAX_OPEN_POSITIONS,
    DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT,
    DEFAULT_MIN_EDGE_TO_BUY_PCT,
)


def test_tuning_state_payload_has_strategy_fields():
    row = SimpleNamespace(
        stop_loss_drawdown_pct=0.80,
        min_edge_to_buy_pct=1,
        stop_loss_selling_enabled=True,
        min_ai_win_prob_buy_side_pct=51,
        max_open_positions=20,
        ai_provider="gemini",
        updated_at=None,
    )
    p = tuning_state_payload(row)
    assert p["ai_provider"] == "gemini"
    assert "gemini_model" in p
    assert "xai_model" in p
    assert abs(p["stop_loss_drawdown_pct"] - 0.80) < 1e-6
    assert p["min_edge_to_buy_pct"] == 1
    assert p["stop_loss_selling_enabled"] is True
    assert p["min_ai_win_prob_buy_side_pct"] == 51
    assert p["max_open_positions"] == 20


def test_tuning_state_payload_coalesces_null_strategy_ints():
    """SQLite NULL on tuning columns must not break API serialization."""
    row = SimpleNamespace(
        stop_loss_drawdown_pct=0.80,
        min_edge_to_buy_pct=None,
        stop_loss_selling_enabled=False,
        min_ai_win_prob_buy_side_pct=None,
        max_open_positions=None,
        updated_at=None,
    )
    p = tuning_state_payload(row)
    assert p["min_edge_to_buy_pct"] == DEFAULT_MIN_EDGE_TO_BUY_PCT
    assert p["min_ai_win_prob_buy_side_pct"] == DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT
    assert p["max_open_positions"] == DEFAULT_MAX_OPEN_POSITIONS
    assert p["ai_provider"] == DEFAULT_AI_PROVIDER


def test_tuning_state_payload_coalesces_null_ai_provider():
    row = SimpleNamespace(
        stop_loss_drawdown_pct=0.80,
        min_edge_to_buy_pct=3,
        stop_loss_selling_enabled=False,
        min_ai_win_prob_buy_side_pct=60,
        max_open_positions=30,
        ai_provider=None,
        updated_at=None,
    )
    p = tuning_state_payload(row)
    assert p["ai_provider"] in ("gemini", "xai")
