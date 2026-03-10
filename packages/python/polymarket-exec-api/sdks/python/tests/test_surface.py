"""
SDK Surface Area Tests

Verifies that every public method defined in BaseExchange.ts is exposed
on each SDK exchange class. No server required — checks class attributes only.
"""

import pytest
import pmxt

PUBLIC_METHODS = [
    "load_markets",
    "fetch_markets",
    "fetch_markets_paginated",
    "fetch_events",
    "fetch_market",
    "fetch_event",
    "fetch_ohlcv",
    "fetch_order_book",
    "fetch_trades",
    "create_order",
    "cancel_order",
    "fetch_order",
    "fetch_open_orders",
    "fetch_my_trades",
    "fetch_closed_orders",
    "fetch_all_orders",
    "fetch_positions",
    "fetch_balance",
    "get_execution_price",
    "get_execution_price_detailed",
    "filter_markets",
    "filter_events",
    "watch_order_book",
    "watch_trades",
    "close",
]

EXCHANGE_CLASSES = [pmxt.Polymarket, pmxt.Kalshi]


@pytest.mark.parametrize("ExchangeClass", EXCHANGE_CLASSES, ids=lambda c: c.__name__)
@pytest.mark.parametrize("method", PUBLIC_METHODS)
def test_method_exists(ExchangeClass, method):
    assert callable(getattr(ExchangeClass, method, None)), (
        f"{ExchangeClass.__name__} is missing method: {method}"
    )
