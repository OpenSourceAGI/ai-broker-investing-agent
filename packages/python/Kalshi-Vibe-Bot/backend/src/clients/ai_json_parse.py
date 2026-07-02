"""Extract and parse JSON from LLM chat responses (Gemini, xAI, etc.)."""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from src.logger import setup_logging

_logger = setup_logging("ai_json_parse")

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", re.DOTALL | re.IGNORECASE)


def strip_json_markdown_fence(text: str) -> str:
    raw = (text or "").strip()
    m = _JSON_FENCE_RE.match(raw)
    return (m.group(1) if m else raw).strip()


def extract_json_object_text(text: str) -> Optional[str]:
    """Return the first balanced ``{...}`` substring, or None."""
    raw = strip_json_markdown_fence(text)
    if not raw:
        return None
    if raw.startswith("{") and raw.endswith("}"):
        return raw
    start = raw.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(raw)):
        ch = raw[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return raw[start : i + 1]
    return None


def loads_json_object(text: str, *, log_label: str = "model") -> Optional[dict[str, Any]]:
    """Parse a JSON object from model text; returns None on failure."""
    raw = strip_json_markdown_fence(text)
    if not raw:
        return None
    try:
        obj = json.loads(raw)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        pass

    blob = extract_json_object_text(raw)
    if not blob:
        _logger.warning("No JSON object in %s response: %s", log_label, raw[:200])
        return None
    try:
        obj = json.loads(blob)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError as e:
        _logger.warning("Invalid JSON in %s response (%s): %s", log_label, e, blob[:200])
        return None
