"""Strict observable bids for open-position marks (no phantom composites)."""

from src.clients.kalshi_client import open_position_estimated_mark_dollars, open_position_mark_dollars


def test_mark_matches_snapshot_yes_bid():
    m = {"yes_bid": 0.44, "yes_ask": 0.52, "no_bid": 0.46, "no_ask": 0.56}
    assert abs(open_position_mark_dollars(m, "YES") - 0.44) < 1e-9


def test_mark_matches_snapshot_no_bid():
    m = {"yes_bid": 0.2, "yes_ask": 0.25, "no_bid": 0.77, "no_ask": 0.82}
    assert abs(open_position_mark_dollars(m, "NO") - 0.77) < 1e-9


def test_mark_ignores_yes_price_when_native_bid_zero():
    """``yes_price`` composite must not invent a bid when ``yes_bid`` is zero (dead-book phantom ¢)."""
    m = {"yes_bid": 0.0, "yes_price": 0.01, "yes_ask": 0.99}
    assert open_position_mark_dollars(m, "YES") == 0.0


def test_mark_ignores_parity_infer_when_snapshot_bid_zero():
    m = {"yes_bid": 0.0, "yes_ask": 0.5, "no_ask": 0.35}
    assert open_position_mark_dollars(m, "YES") == 0.0


def test_mark_orderbook_when_snapshot_bid_zero():
    m = {"yes_bid": 0.0}
    ob = {"orderbook_fp": {"yes_dollars": [["0.0700", "5"]], "no_dollars": []}}
    assert abs(open_position_mark_dollars(m, "YES", ob) - 0.07) < 1e-9


def test_mark_zero_when_no_bid_anywhere():
    m = {"yes_bid": 0.0, "yes_ask": 0.0, "no_bid": 0.0, "no_ask": 0.0}
    assert open_position_mark_dollars(m, "YES") == 0.0


def test_estimated_mark_uses_last_price_dollars_when_yes_bid_empty():
    """Dashboard estimate follows Kalshi last trade; liquidation bid stays zero without a bid."""
    m = {"yes_bid": 0.0, "yes_price": 0.69, "yes_ask": 0.86, "last_price_dollars": "0.6900"}
    assert open_position_mark_dollars(m, "YES") == 0.0
    est = open_position_estimated_mark_dollars(m, "YES")
    assert est is not None and abs(float(est) - 0.69) < 1e-9


def test_estimated_mark_no_side_is_one_minus_yes_last():
    m = {"last_price_dollars": "0.7400"}
    no_est = open_position_estimated_mark_dollars(m, "NO")
    assert no_est is not None and abs(float(no_est) - 0.26) < 1e-9


def test_estimated_mark_none_when_no_last_trade_fields():
    m = {"yes_bid": 0.44, "yes_ask": 0.52}
    assert open_position_estimated_mark_dollars(m, "YES") is None
