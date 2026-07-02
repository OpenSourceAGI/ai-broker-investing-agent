"""AI provider selection helpers."""

from src.ai_provider import ai_provider_display_name, ai_provider_log_label, normalize_ai_provider


def test_normalize_ai_provider_defaults_to_gemini():
    assert normalize_ai_provider(None) == "gemini"
    assert normalize_ai_provider("") == "gemini"
    assert normalize_ai_provider("GEMINI") == "gemini"


def test_normalize_ai_provider_xai():
    assert normalize_ai_provider("xai") == "xai"
    assert normalize_ai_provider("XAI") == "xai"


def test_ai_provider_display_name():
    assert ai_provider_display_name("gemini") == "Gemini"
    assert ai_provider_display_name("xai") == "xAI"


def test_ai_provider_log_label():
    assert ai_provider_log_label("gemini") == "Gemini"
    assert ai_provider_log_label("xai") == "xAI"
