"""Autonomous strategy guardrails."""

from src.decision_engine.strategy_gates import (
    MAX_EDGE_TO_BUY_PCT,
    MAX_KELLY_BANKROLL_PCT,
    autonomous_buy_gate_failure,
    effective_min_edge_for_market,
    effective_scan_min_volume,
    exit_grace_minutes_for_market,
    is_sports_market_title,
    kelly_contract_cap_for_bankroll,
)


def test_is_sports_market_title():
    assert is_sports_market_title("Team A vs Team B: Total Goals")
    assert not is_sports_market_title("Bitcoin price on May 17")


def test_effective_scan_min_volume_sports():
    assert effective_scan_min_volume(1500, "A vs B") >= 2000


def test_effective_min_edge_matches_settings():
    assert effective_min_edge_for_market(5, "A vs B") == 5
    assert effective_min_edge_for_market(5, "Bitcoin") == 5


def test_exit_grace_sports_extra():
    assert exit_grace_minutes_for_market(10, "A vs B") == 15


def test_autonomous_max_edge():
    assert autonomous_buy_gate_failure(side="YES", ai_yes_pct=70, edge_pct=30, entry_price_dollars=0.5)


def test_autonomous_overconfidence_mid_chalk():
    assert autonomous_buy_gate_failure(side="YES", ai_yes_pct=80, edge_pct=12, entry_price_dollars=0.55)


def test_autonomous_passes_sweet_spot():
    assert autonomous_buy_gate_failure(side="YES", ai_yes_pct=68, edge_pct=12, entry_price_dollars=0.48) is None


def test_autonomous_passes_high_confidence_favorite():
    """85% on NO at 73¢ (market favorite) should not be blocked by the global AI cap."""
    assert (
        autonomous_buy_gate_failure(side="NO", ai_yes_pct=15, edge_pct=12.0, entry_price_dollars=0.73)
        is None
    )


def test_autonomous_blocks_extreme_ai_confidence():
    assert autonomous_buy_gate_failure(side="NO", ai_yes_pct=5, edge_pct=12.0, entry_price_dollars=0.73)


def test_kelly_contract_cap_scales_with_bankroll():
    assert kelly_contract_cap_for_bankroll(75, 0.50) == 7
    assert kelly_contract_cap_for_bankroll(1000, 0.50) == 100


def test_kelly_contract_cap_small_bankroll_uses_cash_when_pct_below_one_contract():
    # 5% of $10.46 < one contract at 67¢; cap falls back to cash affordance (15).
    assert kelly_contract_cap_for_bankroll(10.46, 0.67) == 15


def test_constants_sane():
    assert MAX_EDGE_TO_BUY_PCT == 22
    assert MAX_KELLY_BANKROLL_PCT == 0.05
