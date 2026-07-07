"""Orderbook helpers used for IOC exit pricing."""

from src.clients.kalshi_client import (
    _exit_price_kw_signature,
    _yes_no_limit_price_dollars_field,
    _yes_no_limit_price_field,
    best_orderbook_native_bid_dollars_string,
    native_bids_available_for_exit,
)


def test_best_orderbook_native_bid_no_side():
    raw = {
        "orderbook_fp": {
            "yes_dollars": [["0.9400", "100.00"]],
            "no_dollars": [["0.0600", "10.00"]],
        }
    }
    assert best_orderbook_native_bid_dollars_string(raw, "NO") == "0.0600"
    assert best_orderbook_native_bid_dollars_string(raw, "no") == "0.0600"


def test_best_orderbook_native_bid_yes_side():
    raw = {"orderbook_fp": {"yes_dollars": [["0.0700", "5"]], "no_dollars": []}}
    assert best_orderbook_native_bid_dollars_string(raw, "YES") == "0.0700"


def test_best_orderbook_empty():
    assert best_orderbook_native_bid_dollars_string({}, "NO") is None
    assert best_orderbook_native_bid_dollars_string(None, "NO") is None
    assert best_orderbook_native_bid_dollars_string({"orderbook_fp": {}}, "NO") is None


def test_native_bids_available_from_orderbook_only():
    raw = {"orderbook_fp": {"yes_dollars": [["0.0700", "5"]], "no_dollars": []}}
    market = {"yes_bid": 0.0, "no_bid": 0.0}
    assert native_bids_available_for_exit(raw, market, "YES")


def test_native_bids_available_from_market_snapshot_only():
    assert native_bids_available_for_exit(None, {"yes_bid": 0.06}, "YES")


def test_native_bids_unavailable_empty_book_and_snapshot():
    assert not native_bids_available_for_exit({"orderbook_fp": {"yes_dollars": [], "no_dollars": []}}, {}, "YES")


def test_native_bids_infer_only_does_not_count_without_native():
    """Parity-inferred bid must not satisfy exit preflight (infer=False path)."""
    market = {"yes_bid": 0.0, "no_ask": 0.4}  # would infer YES bid ~0.6
    assert not native_bids_available_for_exit(None, market, "YES")


def test_native_bids_ignore_yes_price_composite():
    assert not native_bids_available_for_exit(None, {"yes_bid": 0.0, "yes_price": 0.06}, "YES")


def test_exit_price_kw_signature_dedupes_cents_vs_dollars():
    a = _yes_no_limit_price_field("NO", 6)
    b = _yes_no_limit_price_dollars_field("NO", "0.0600")
    assert _exit_price_kw_signature(a) != _exit_price_kw_signature(b)
