"""Normalize AI provider fields on analysis API / WebSocket payloads."""

from typing import Any, Dict

from src.config import settings


def enrich_analysis_ai_provider(payload: Dict[str, Any]) -> None:
    """Ensure ``ai_provider`` and ``xai_analysis.provider`` / ``model`` for UI (mutates *payload*)."""
    escalated = bool(payload.get("escalated_to_xai") or payload.get("escalated_to_ai"))
    if not escalated:
        return

    xa = payload.get("xai_analysis")
    if not isinstance(xa, dict):
        xa = {}
        payload["xai_analysis"] = xa

    prov = str(payload.get("ai_provider") or xa.get("provider") or "").lower().strip()
    model_raw = str(xa.get("model") or "").strip()
    model = model_raw.lower()
    if prov not in ("gemini", "xai"):
        if "gemini" in model:
            prov = "gemini"
        elif "grok" in model:
            prov = "xai"
        else:
            # Legacy rows (pre-provider field): ``escalated_to_xai`` meant Grok/xAI only.
            # Do not use ``default_ai_provider`` — that mislabels old trades after Gemini was added.
            prov = "xai"

    xa["provider"] = prov
    if not model_raw:
        xa["model"] = (
            getattr(settings, "gemini_model", "gemini-2.5-flash")
            if prov == "gemini"
            else getattr(settings, "xai_model", "grok-3")
        )

    payload["ai_provider"] = prov
    payload["ai_analysis"] = xa
    payload["escalated_to_ai"] = True
