"""AI provider selection helpers (Gemini vs xAI)."""

from __future__ import annotations

from typing import Literal

from src.config import DEFAULT_AI_PROVIDER

AiProvider = Literal["gemini", "xai"]


def normalize_ai_provider(value: object, *, default: str = DEFAULT_AI_PROVIDER) -> AiProvider:
    v = str(value or default).strip().lower()
    return "xai" if v == "xai" else "gemini"


def ai_provider_display_name(provider: object) -> str:
    return "xAI" if normalize_ai_provider(provider) == "xai" else "Gemini"


def ai_provider_log_label(provider: object) -> str:
    """Short label for log messages (matches client logger names where possible)."""
    return "xAI" if normalize_ai_provider(provider) == "xai" else "Gemini"
