"""Event-batch JSON: mutually exclusive outcome map + P(YES) reconciliation."""

import json

from src.clients.xai_client import _parse_event_batch_json


def test_partition_map_reconciles_ai_yes_for_chosen_leg():
    allowed = {"M1", "M2", "M3"}
    content = json.dumps(
        {
            "best_market_id": "M2",
            "direction": "YES",
            "ai_probability_yes_pct": 90,
            "outcome_probability_pct_by_market_id": {"M1": 35, "M2": 42, "M3": 23},
            "reasoning": "partition",
            "real_time_context": "x",
            "key_factors": [],
            "evidence": [],
        }
    )
    p = _parse_event_batch_json(content, allowed_ids=allowed)
    assert p["ai_probability_yes_pct"] == 42
    assert p["outcome_probability_pct_by_market_id"]["M2"] == 42


def test_partial_map_keeps_model_ai_yes():
    allowed = {"M1", "M2", "M3"}
    content = json.dumps(
        {
            "best_market_id": "M2",
            "direction": "YES",
            "ai_probability_yes_pct": 55,
            "outcome_probability_pct_by_market_id": {"M1": 40, "M2": 60},
            "reasoning": "incomplete partition",
            "real_time_context": "x",
            "key_factors": [],
            "evidence": [],
        }
    )
    p = _parse_event_batch_json(content, allowed_ids=allowed)
    assert p["ai_probability_yes_pct"] == 55
    assert "outcome_probability_pct_by_market_id" in p
    assert set(p["outcome_probability_pct_by_market_id"].keys()) == {"M1", "M2"}


def test_bad_sum_ignores_reconciliation():
    allowed = {"M1", "M2", "M3"}
    content = json.dumps(
        {
            "best_market_id": "M2",
            "direction": "YES",
            "ai_probability_yes_pct": 55,
            "outcome_probability_pct_by_market_id": {"M1": 10, "M2": 20, "M3": 30},
            "reasoning": "sum 60",
            "real_time_context": "x",
            "key_factors": [],
            "evidence": [],
        }
    )
    p = _parse_event_batch_json(content, allowed_ids=allowed)
    assert p["ai_probability_yes_pct"] == 55


def test_ladder_batch_keeps_independent_probability_map():
    allowed = {"M1", "M2", "M3"}
    content = json.dumps(
        {
            "best_market_id": "M2",
            "direction": "YES",
            "ai_probability_yes_pct": 55,
            "outcome_probability_pct_by_market_id": {"M1": 35, "M2": 42, "M3": 23},
            "reasoning": "x",
            "real_time_context": "x",
            "key_factors": [],
            "evidence": [],
        }
    )
    p = _parse_event_batch_json(content, allowed_ids=allowed, ladder_stat_line_batch=True)
    assert p["ai_probability_yes_pct"] == 42
    assert p["outcome_probability_pct_by_market_id"]["M2"] == 42


def test_ladder_batch_overrides_to_higher_likelihood_yes_leg():
    """Over 2.5 very likely but model picked Over 3.5 for edge — server picks higher P(YES)."""
    allowed = {"OVER25", "OVER35", "OVER45"}
    content = json.dumps(
        {
            "best_market_id": "OVER35",
            "direction": "YES",
            "ai_probability_yes_pct": 65,
            "outcome_probability_pct_by_market_id": {"OVER25": 82, "OVER35": 65, "OVER45": 40},
            "reasoning": "Over 2.5 is very likely; Over 3.5 offers better balance of return.",
            "real_time_context": "x",
            "key_factors": [],
            "evidence": [],
        }
    )
    p = _parse_event_batch_json(content, allowed_ids=allowed, ladder_stat_line_batch=True)
    assert p["best_market_id"] == "OVER25"
    assert p["ai_probability_yes_pct"] == 82
    assert p.get("batch_likelihood_override") is True


def test_ladder_batch_overrides_no_to_highest_p_no_leg():
    allowed = {"OVER25", "OVER35"}
    content = json.dumps(
        {
            "best_market_id": "OVER35",
            "direction": "NO",
            "ai_probability_yes_pct": 45,
            "outcome_probability_pct_by_market_id": {"OVER25": 20, "OVER35": 45},
            "reasoning": "x",
            "real_time_context": "x",
            "key_factors": [],
            "evidence": [],
        }
    )
    p = _parse_event_batch_json(content, allowed_ids=allowed, ladder_stat_line_batch=True)
    assert p["best_market_id"] == "OVER25"
    assert p["ai_probability_yes_pct"] == 20
