"""Tuning API: AI provider switch and validation."""

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.api.tuning import _require_api_key_for_provider, tuning_state_payload
from src.config import settings as app_settings


def test_tuning_state_payload_includes_models(monkeypatch):
    monkeypatch.setattr(app_settings, "gemini_model", "gemini-2.5-flash")
    monkeypatch.setattr(app_settings, "xai_model", "grok-3-test")
    row = SimpleNamespace(
        stop_loss_drawdown_pct=0.80,
        min_edge_to_buy_pct=3,
        stop_loss_selling_enabled=False,
        min_ai_win_prob_buy_side_pct=60,
        max_open_positions=30,
        ai_provider="gemini",
        updated_at=None,
    )
    p = tuning_state_payload(row)
    assert p["gemini_model"] == "gemini-2.5-flash"
    assert p["xai_model"] == "grok-3-test"


def test_require_api_key_for_gemini_missing(monkeypatch):
    monkeypatch.setattr(app_settings, "gemini_api_key", "")
    with pytest.raises(HTTPException) as exc:
        _require_api_key_for_provider("gemini")
    assert exc.value.status_code == 400
    assert "GEMINI_API_KEY" in str(exc.value.detail)


def test_require_api_key_for_xai_missing(monkeypatch):
    monkeypatch.setattr(app_settings, "xai_api_key", "")
    with pytest.raises(HTTPException) as exc:
        _require_api_key_for_provider("xai")
    assert exc.value.status_code == 400
    assert "XAI_API_KEY" in str(exc.value.detail)
