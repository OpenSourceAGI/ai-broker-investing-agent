"""pick_display_expected_expiration_iso prefers API expected end before contractual close."""

from src.reconcile.kalshi_positions import pick_display_expected_expiration_iso


def test_prefers_expected_expiration_when_present():
    m = {
        "close_time": "2026-05-24T00:30:00Z",
        "expected_expiration_time": "2026-05-10T03:30:00Z",
        "vetting_horizon_time": "2026-05-10T03:30:00Z",
    }
    assert pick_display_expected_expiration_iso(m) == "2026-05-10T03:30:00Z"


def test_falls_back_to_vetting_when_earlier_than_contractual():
    m = {
        "close_time": "2026-05-24T00:30:00Z",
        "expected_expiration_time": None,
        "vetting_horizon_time": "2026-05-10T03:30:00Z",
    }
    assert pick_display_expected_expiration_iso(m) == "2026-05-10T03:30:00Z"


def test_no_fallback_when_vetting_equals_contractual():
    m = {
        "close_time": "2026-05-24T00:30:00Z",
        "vetting_horizon_time": "2026-05-24T00:30:00Z",
    }
    assert pick_display_expected_expiration_iso(m) is None


def test_terminal_prefers_occurrence_over_far_expected():
    m = {
        "kalshi_api_status": "finalized",
        "occurrence_datetime": "2026-05-14T18:00:00Z",
        "expected_expiration_time": "2026-05-28T14:00:00Z",
        "close_time": "2026-05-28T13:02:00Z",
    }
    assert pick_display_expected_expiration_iso(m) == "2026-05-14T18:00:00Z"


def test_active_still_prefers_expected_over_occurrence():
    m = {
        "kalshi_api_status": "active",
        "occurrence_datetime": "2026-05-10T12:00:00Z",
        "expected_expiration_time": "2026-05-12T12:00:00Z",
        "close_time": "2026-05-24T00:00:00Z",
    }
    assert pick_display_expected_expiration_iso(m) == "2026-05-12T12:00:00Z"
