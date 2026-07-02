"""JSON extraction from LLM responses."""

from src.clients.ai_json_parse import extract_json_object_text, loads_json_object, strip_json_markdown_fence


def test_strip_json_fence():
    raw = '```json\n{"direction": "YES"}\n```'
    assert strip_json_markdown_fence(raw) == '{"direction": "YES"}'


def test_extract_balanced_object():
    text = 'Here is output:\n{"direction": "NO", "ai_probability_yes_pct": 40}\nThanks'
    blob = extract_json_object_text(text)
    assert blob is not None
    obj = loads_json_object(blob)
    assert obj["direction"] == "NO"
    assert obj["ai_probability_yes_pct"] == 40


def test_truncated_json_returns_none():
    assert loads_json_object('{ "direction": "SKIP",\n    "ai_probability') is None
