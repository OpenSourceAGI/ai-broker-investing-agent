"""Normalization helpers used before scan vetting."""

from unittest.mock import patch

from src.clients.kalshi_client import KalshiClient


@patch.object(KalshiClient, "_load_private_key", lambda self: None)
def test_volume_is_max_across_fp_and_total_when_24h_zero():
    kc = KalshiClient("", str(__file__))
    raw = {
        "ticker": "KX-TESTVOL",
        "market_type": "binary",
        "status": "active",
        "yes_bid_dollars": "0.4000",
        "yes_ask_dollars": "0.4200",
        "no_bid_dollars": "0.5800",
        "no_ask_dollars": "0.6000",
        "volume_24h_fp": "0",
        "volume_fp": "7500.5",
        "close_time": "2030-01-01T00:00:00Z",
    }
    n = kc._normalize_market(raw)
    assert n["volume"] >= 7500.0


@patch.object(KalshiClient, "_load_private_key", lambda self: None)
def test_vetting_horizon_is_earlier_of_occurrence_and_expected():
    kc = KalshiClient("", str(__file__))
    raw = {
        "ticker": "KX-TESTVT",
        "market_type": "binary",
        "status": "active",
        "yes_bid_dollars": "0.4000",
        "yes_ask_dollars": "0.4200",
        "expected_expiration_time": "2030-06-01T00:00:00Z",
        "occurrence_datetime": "2030-05-01T12:00:00Z",
        "close_time": "2030-12-01T00:00:00Z",
    }
    n = kc._normalize_market(raw)
    assert n["vetting_horizon_time"] == "2030-05-01T12:00:00Z"


@patch.object(KalshiClient, "_load_private_key", lambda self: None)
def test_no_occurrence_or_expected_yields_no_vetting_horizon():
    raw = {
        "ticker": "KX-NOFB",
        "market_type": "binary",
        "status": "active",
        "yes_bid_dollars": "0.4000",
        "yes_ask_dollars": "0.4200",
        "close_time": "2030-01-01T00:00:00Z",
    }
    kc = KalshiClient("", str(__file__))
    n = kc._normalize_market(raw)
    assert n["vetting_horizon_time"] is None


@patch.object(KalshiClient, "_load_private_key", lambda self: None)
def test_empty_result_infer_yes_from_settlement_value_dollars():
    kc = KalshiClient("", str(__file__))
    raw = {
        "ticker": "KXWNBAGAME-TEST",
        "market_type": "binary",
        "status": "finalized",
        "result": "",
        "settlement_value_dollars": "1.0000",
        "yes_bid_dollars": "0.9900",
        "yes_ask_dollars": "1.0000",
        "no_bid_dollars": "0.0000",
        "no_ask_dollars": "0.0100",
        "close_time": "2030-01-01T00:00:00Z",
    }
    n = kc._normalize_market(raw)
    assert n["resolution_result"] == "yes"


@patch.object(KalshiClient, "_load_private_key", lambda self: None)
def test_empty_result_infer_no_from_settlement_value_dollars():
    kc = KalshiClient("", str(__file__))
    raw = {
        "ticker": "KXWNBAGAME-TEST2",
        "market_type": "binary",
        "status": "finalized",
        "result": "",
        "settlement_value_dollars": "0.0000",
        "yes_bid_dollars": "0.0000",
        "yes_ask_dollars": "0.0100",
        "no_bid_dollars": "0.9900",
        "no_ask_dollars": "1.0000",
        "close_time": "2030-01-01T00:00:00Z",
    }
    n = kc._normalize_market(raw)
    assert n["resolution_result"] == "no"


@patch.object(KalshiClient, "_load_private_key", lambda self: None)
def test_explicit_result_wins_over_settlement_value():
    kc = KalshiClient("", str(__file__))
    raw = {
        "ticker": "KX-OVERRIDE",
        "market_type": "binary",
        "status": "finalized",
        "result": "no",
        "settlement_value_dollars": "1.0000",
        "yes_bid_dollars": "0.4000",
        "yes_ask_dollars": "0.4200",
        "no_bid_dollars": "0.5800",
        "no_ask_dollars": "0.6000",
        "close_time": "2030-01-01T00:00:00Z",
    }
    n = kc._normalize_market(raw)
    assert n["resolution_result"] == "no"
