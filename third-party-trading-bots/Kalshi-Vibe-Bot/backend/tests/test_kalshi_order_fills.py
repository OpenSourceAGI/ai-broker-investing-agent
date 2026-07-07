"""Regression tests for Kalshi order fill → exit price / proceeds parsing."""

from src.clients.kalshi_client import (
    kalshi_order_average_fill_price_dollars,
    kalshi_order_avg_contract_price_and_cost,
    kalshi_order_avg_contract_price_and_cost_for_held_side,
    kalshi_order_avg_contract_price_and_proceeds,
    kalshi_order_avg_contract_price_and_proceeds_for_held_side,
)


def test_sell_no_negative_fill_cost_is_no_price_not_one_minus():
    """NO-leg fills: |cost|/count is already NO $/contract — must not apply ``1 - yes`` (would ~double)."""
    order = {
        "side": "no",
        "action": "sell",
        "fill_count_fp": "2",
        "taker_fill_cost_dollars": "-0.60",
        "maker_fill_cost_dollars": "0",
        "taker_fees_dollars": "0.02",
        "maker_fees_dollars": "0",
        "yes_price_dollars": "0.70",
        "no_price_dollars": "0.01",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds(
        order, filled=2.0, fallback_per_contract_dollars=0.5
    )
    assert abs(eff - 0.30) < 1e-6, eff
    assert abs(net - 0.58) < 1e-6, net


def test_buy_no_positive_fill_cost_is_no_price_not_one_minus():
    order = {
        "side": "no",
        "action": "buy",
        "fill_count_fp": "2",
        "taker_fill_cost_dollars": "0.60",
        "maker_fill_cost_dollars": "0",
        "taker_fees_dollars": "0.02",
        "maker_fees_dollars": "0",
    }
    eff, total = kalshi_order_avg_contract_price_and_cost(order, filled=2.0, fallback_per_contract_dollars=0.5)
    assert abs(eff - 0.31) < 1e-6, eff
    assert abs(total - 0.62) < 1e-6, total


def test_sell_yes_negative_fill_cost_uses_proceeds_not_no_limit():
    """Kalshi credits sells as negative fill cost; must not skip to NO leg limit (~93¢)."""
    order = {
        "side": "yes",
        "action": "sell",
        "fill_count_fp": "2",
        "taker_fill_cost_dollars": "-0.14",
        "maker_fill_cost_dollars": "0",
        "taker_fees_dollars": "0.02",
        "maker_fees_dollars": "0",
        # Contrasting leg prices that previously poisoned fallback (``np if np > 0``).
        "yes_price_dollars": "0.01",
        "no_price_dollars": "0.93",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds(
        order, filled=2.0, fallback_per_contract_dollars=0.5
    )
    assert abs(eff - 0.07) < 1e-6, eff
    assert abs(net - 0.12) < 1e-6, net


def test_buy_yes_positive_fill_cost_matches_trade_history_avg():
    order = {
        "side": "yes",
        "action": "buy",
        "fill_count_fp": "2",
        "taker_fill_cost_dollars": "0.64",
        "maker_fill_cost_dollars": "0",
        "taker_fees_dollars": "0.03",
        "maker_fees_dollars": "0",
    }
    eff, total = kalshi_order_avg_contract_price_and_cost(
        order, filled=2.0, fallback_per_contract_dollars=0.5
    )
    assert abs(eff - 0.335) < 1e-6, eff
    assert abs(total - 0.67) < 1e-6, total


def test_average_fill_price_whole_cents_integer():
    order = {"average_fill_price": 35}
    assert abs(kalshi_order_average_fill_price_dollars(order) - 0.35) < 1e-9


def test_average_fill_price_whole_cents_string_no_decimal():
    order = {"average_fill_price": "48"}
    assert abs(kalshi_order_average_fill_price_dollars(order) - 0.48) < 1e-9


def test_sell_yes_positive_fill_cost_is_no_leg_dollars_convert_with_complement():
    """Production: sell YES can expose +taker_fill_cost as NO notional (Denver temp example)."""
    order = {
        "side": "yes",
        "action": "sell",
        "fill_count_fp": "12.00",
        "taker_fill_cost_dollars": "11.520000",
        "maker_fill_cost_dollars": "0",
        "taker_fees_dollars": "0.040000",
        "maker_fees_dollars": "0",
        "yes_price_dollars": "0.0100",
        "no_price_dollars": "0.9900",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds(
        order, filled=12.0, fallback_per_contract_dollars=0.5
    )
    assert abs(eff - (1.0 - (11.52 + 0.04) / 12.0)) < 1e-9, eff
    assert abs(net - (eff * 12.0 - 0.04)) < 1e-6, net


def test_sell_no_positive_fill_cost_is_yes_leg_dollars_convert_with_complement():
    """Production GET order (elections API): sell NO can expose +taker_fill_cost as YES notional."""
    order = {
        "side": "no",
        "action": "sell",
        "fill_count_fp": "5.00",
        "taker_fill_cost_dollars": "4.300000",
        "maker_fill_cost_dollars": "0",
        "taker_fees_dollars": "0.050000",
        "maker_fees_dollars": "0",
        "yes_price_dollars": "0.9900",
        "no_price_dollars": "0.0100",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds(
        order, filled=5.0, fallback_per_contract_dollars=0.18
    )
    assert abs(eff - 0.13) < 1e-9, eff
    assert abs(net - 0.60) < 1e-9, net


def test_sell_yes_prefers_api_vwap_when_fill_cost_per_contract_diverges():
    """GET order can expose inconsistent taker_fill vs average_fill; trust VWAP when far apart."""
    order = {
        "side": "yes",
        "action": "sell",
        "fill_count_fp": "2",
        "taker_fill_cost_dollars": "-1.26",
        "taker_fees_dollars": "0.04",
        "maker_fill_cost_dollars": "0",
        "maker_fees_dollars": "0",
        "average_fill_price_dollars": "0.3500",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds(
        order, filled=2.0, fallback_per_contract_dollars=0.5
    )
    assert abs(eff - 0.35) < 1e-9
    assert abs(net - (0.70 - 0.04)) < 1e-9


def test_integer_yes_price_one_cent_without_dollars_field():
    order = {
        "side": "yes",
        "action": "sell",
        "fill_count_fp": "0",
        "yes_price": 1,
        "taker_fill_cost_dollars": "0",
        "maker_fill_cost_dollars": "0",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds(
        order, filled=2.0, fallback_per_contract_dollars=0.5
    )
    assert abs(eff - 0.01) < 1e-9
    assert abs(net - 0.02) < 1e-9


def test_buy_no_production_fill_cost_below_contract_avg_plus_fee():
    """Elections GET order: ``taker_fill_cost`` can sit below displayed contract cost; include fees in avg."""
    order = {
        "side": "no",
        "action": "buy",
        "fill_count_fp": "1.00",
        "taker_fill_cost_dollars": "0.420000",
        "maker_fill_cost_dollars": "0.000000",
        "taker_fees_dollars": "0.020000",
        "maker_fees_dollars": "0.000000",
        "yes_price_dollars": "0.5600",
        "no_price_dollars": "0.4400",
    }
    eff, total = kalshi_order_avg_contract_price_and_cost(order, filled=1.0, fallback_per_contract_dollars=0.44)
    assert abs(eff - 0.44) < 1e-9, eff
    assert abs(total - 0.44) < 1e-9, total


def test_exit_no_reported_as_buy_yes_maps_to_no_held_side_price():
    """Kalshi activity: buy YES @ ~91¢ to close a NO leg → held-side exit ~9¢, not 91¢."""
    order = {
        "side": "yes",
        "action": "buy",
        "fill_count_fp": "3.00",
        "taker_fill_cost_dollars": "2.720000",
        "maker_fill_cost_dollars": "0",
        "taker_fees_dollars": "0.020000",
        "maker_fees_dollars": "0",
        "average_fill_price": "90.67",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds_for_held_side(
        order, held_side="NO", filled=3.0, fallback_per_contract_dollars=0.60
    )
    assert eff < 0.15, eff
    assert eff > 0.05, eff
    assert net < 0.35, net


def test_sell_no_ioc_positive_fill_is_opposite_leg_not_raw_per_contract():
    """IOC exit shows Limit 1¢ on NO leg but avg fill 47¢ — positive fill is YES notional; complement to NO."""
    order = {
        "side": "no",
        "action": "sell",
        "fill_count_fp": "1.00",
        "taker_fill_cost_dollars": "0.510000",
        "maker_fill_cost_dollars": "0.000000",
        "taker_fees_dollars": "0.020000",
        "maker_fees_dollars": "0.000000",
        "yes_price_dollars": "0.9900",
        "no_price_dollars": "0.0100",
    }
    eff, net = kalshi_order_avg_contract_price_and_proceeds(order, filled=1.0, fallback_per_contract_dollars=0.44)
    assert abs(eff - 0.47) < 1e-9, eff
    assert abs(net - 0.45) < 1e-9, net
