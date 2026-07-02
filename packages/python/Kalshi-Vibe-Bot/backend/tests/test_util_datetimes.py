from datetime import datetime, timezone

from src.util.datetimes import ensure_utc, utc_iso_z, utc_now, utc_today


def test_utc_now_is_aware_utc():
    n = utc_now()
    assert n.tzinfo is not None
    assert n.utcoffset().total_seconds() == 0


def test_ensure_utc_naive_becomes_utc():
    n = datetime(2024, 6, 1, 12, 0, 0)
    u = ensure_utc(n)
    assert u is not None
    assert u.tzinfo == timezone.utc
    assert u.hour == 12


def test_utc_iso_z_appends_z():
    s = utc_iso_z(datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc))
    assert s is not None
    assert s.endswith("Z")
    assert "+" not in s


def test_utc_today_matches_utc_now():
    assert utc_today() == utc_now().date()
