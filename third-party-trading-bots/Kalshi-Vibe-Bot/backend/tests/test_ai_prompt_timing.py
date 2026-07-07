"""Server clock lines for AI prompts."""

from datetime import datetime, timezone

from src.decision_engine.ai_prompt_timing import build_ai_timing_for_prompt


def test_may17_10pm_edt_still_16_minutes_before_resolution():
    """10pm EDT May 17 = 02:00 UTC May 18; 01:44 UTC is 16 minutes before — not 'already past'."""
    now = datetime(2026, 5, 18, 1, 44, 0, tzinfo=timezone.utc)
    timing = build_ai_timing_for_prompt(
        expected_expiration_time="2026-05-18T02:00:00Z",
        close_time="2026-05-19T04:00:00Z",
        now=now,
    )
    assert "16 minute" in timing["time_until_resolution"]
    assert "NOT" in timing["time_until_resolution"]
    assert timing["now_utc"].startswith("2026-05-18T01:44")
    assert timing["resolution_at_utc"].startswith("2026-05-18T02:00")
    assert "2026-05-17" in timing["resolution_at_et"] or "10:00" in timing["resolution_at_et"]


def test_sub_hour_remaining_not_zero_hours():
    now = datetime(2026, 5, 18, 1, 50, 0, tzinfo=timezone.utc)
    timing = build_ai_timing_for_prompt(
        expected_expiration_time="2026-05-18T02:00:00Z",
        now=now,
    )
    assert "minute" in timing["time_until_resolution"].lower()
    assert "~0 hour" not in timing["time_until_resolution"]
