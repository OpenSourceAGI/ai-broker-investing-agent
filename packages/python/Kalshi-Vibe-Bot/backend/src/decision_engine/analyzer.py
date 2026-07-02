"""AI decision engine: outcome direction + calibrated P(YES), with server-side edge and Kelly."""

import uuid
from typing import Any, Dict, List, Optional, Union

from src.ai_provider import ai_provider_display_name, normalize_ai_provider
from src.clients.gemini_client import GeminiClient
from src.clients.kalshi_client import buy_side_liquidity_skip_summary
from src.clients.xai_client import XAIClient
from src.decision_engine.strategy_math import (
    edge_pct_for_side,
    full_kelly_fraction_for_side,
    kelly_contracts_for_order,
    market_implied_pct_for_side,
)
from src.decision_engine.strategy_gates import kelly_contract_cap_for_bankroll
from src.reconcile.open_positions import normalize_market_id
from src.logger import setup_logging
from src.util.datetimes import utc_iso_z, utc_now

_logger = setup_logging("decision_engine")


def _leg_book_as_market(leg: Dict[str, Any]) -> Dict[str, Any]:
    """Flatten batch ``leg`` into the shape ``buy_side_liquidity_skip_summary`` expects."""
    cp = leg.get("current_prices") or {}
    yb = float(cp.get("yes_bid") or 0.0)
    ya = float(cp.get("yes_ask") or 0.0)
    nb = float(cp.get("no_bid") or 0.0)
    na = float(cp.get("no_ask") or 0.0)
    yes_spread = leg.get("yes_spread")
    no_spread = leg.get("no_spread")
    if yes_spread is None and yb > 0 and ya > 0:
        yes_spread = ya - yb
    if no_spread is None and nb > 0 and na > 0:
        no_spread = na - nb
    return {
        "yes_bid": cp.get("yes_bid"),
        "yes_ask": cp.get("yes_ask"),
        "no_bid": cp.get("no_bid"),
        "no_ask": cp.get("no_ask"),
        "yes_ask_size": cp.get("yes_ask_size"),
        "no_ask_size": cp.get("no_ask_size"),
        "yes_spread": float(yes_spread) if yes_spread is not None else 1.0,
        "no_spread": float(no_spread) if no_spread is not None else 1.0,
    }


def _parse_ai_yes_pct(xai_result: Dict[str, Any]) -> int:
    raw = xai_result.get("ai_probability_yes_pct", xai_result.get("confidence_pct"))
    try:
        v = int(raw if raw is not None else 50)
    except Exception:
        v = 50
    return max(0, min(100, v))


def _enrich_strategy_fields(
    *,
    direction: str,
    ai_yes_pct: int,
    current_prices: dict,
    bankroll: float,
) -> Dict[str, Any]:
    yes_mid = float(current_prices.get("yes", 0.5) or 0.5)
    no_mid = float(current_prices.get("no", 0.5) or 0.5)
    y_ask = current_prices.get("yes_ask")
    n_ask = current_prices.get("no_ask")
    yes_ask_f = float(y_ask) if y_ask is not None and float(y_ask) > 0 else None
    no_ask_f = float(n_ask) if n_ask is not None and float(n_ask) > 0 else None

    if direction not in ("YES", "NO"):
        return {
            "ai_probability_yes_pct": ai_yes_pct,
            "market_implied_probability_pct": 0,
            "edge_pct": 0.0,
            "kelly_fraction": 0.0,
            "kelly_contracts": 0,
        }

    edge = edge_pct_for_side(direction, ai_yes_pct, yes_ask_f, no_ask_f, yes_mid, no_mid)
    mkt = market_implied_pct_for_side(direction, yes_ask_f, no_ask_f, yes_mid, no_mid)
    kf = full_kelly_fraction_for_side(direction, ai_yes_pct, yes_ask_f, no_ask_f, yes_mid, no_mid)
    if str(direction).upper() == "YES":
        premium = float(yes_ask_f) if yes_ask_f is not None else yes_mid
    else:
        premium = float(no_ask_f) if no_ask_f is not None else no_mid
    premium = max(1e-12, min(1.0, float(premium)))
    br = float(bankroll)
    kcap = kelly_contract_cap_for_bankroll(br, premium)
    kc, _ = kelly_contracts_for_order(
        br,
        direction,
        ai_yes_pct,
        yes_ask_f,
        no_ask_f,
        yes_mid,
        no_mid,
        per_contract_premium=premium,
        max_kelly_contracts=kcap,
    )
    return {
        "ai_probability_yes_pct": ai_yes_pct,
        "market_implied_probability_pct": mkt,
        "edge_pct": float(edge),
        "kelly_fraction": float(kf),
        "kelly_contracts": int(kc),
    }


class DecisionEngine:
    """Gemini or xAI decision engine with server-side edge and full Kelly sizing."""

    def __init__(
        self,
        *,
        xai_api_key: str,
        xai_model: str = "grok-3",
        gemini_api_key: str,
        gemini_model: str = "gemini-2.5-flash",
        temperature: float = 0.1,
        ai_provider: str = "gemini",
    ):
        self.xai = XAIClient(api_key=xai_api_key, model=xai_model)
        self.gemini = GeminiClient(api_key=gemini_api_key, model=gemini_model)
        self.temperature = float(temperature)
        self.ai_provider = normalize_ai_provider(ai_provider)

    def set_ai_provider(self, provider: str) -> None:
        self.ai_provider = normalize_ai_provider(provider)

    def _active_client(self) -> Union[XAIClient, GeminiClient]:
        if self.ai_provider == "xai":
            return self.xai
        return self.gemini

    async def analyze_market(
        self,
        market_id: str,
        market_title: str,
        market_description: str,
        current_prices: dict,
        volume: float,
        expires_in_days: float = 1.0,
        *,
        close_time: Optional[str] = None,
        expected_expiration_time: Optional[str] = None,
        vetting_horizon_time: Optional[str] = None,
        market_timing: Optional[Dict[str, Any]] = None,
        deployable_balance: float = 0.0,
    ) -> Dict[str, Any]:
        yes_price = float(current_prices.get("yes", 0.5) or 0.5)
        no_price = float(current_prices.get("no", 0.5) or 0.5)

        base: Dict[str, Any] = {
            "decision_id": str(uuid.uuid4()),
            "market_id": market_id,
            "market_title": market_title,
            "timestamp": utc_iso_z(utc_now()),
            "escalated_to_xai": True,
        }

        provider_label = ai_provider_display_name(self.ai_provider)
        ai_result = await self._active_client().analyze_market(
            market_title=market_title,
            market_description=market_description,
            current_prices=current_prices,
            volume=volume,
            expires_in_days=expires_in_days,
            close_time=close_time,
            expected_expiration_time=expected_expiration_time,
            vetting_horizon_time=vetting_horizon_time,
            market_timing=market_timing,
            temperature=self.temperature,
        )

        if "error" in ai_result:
            _logger.warning("%s error for %s: %s", provider_label, market_id, ai_result.get("error"))
            return {
                **base,
                "decision": "SKIP",
                "direction": "SKIP",
                "ai_probability_yes_pct": 50,
                "market_implied_probability_pct": 0,
                "edge_pct": 0.0,
                "kelly_fraction": 0.0,
                "kelly_contracts": 0,
                "confidence": 0.5,
                "yes_confidence": int(yes_price * 100),
                "no_confidence": int(no_price * 100),
                "reasoning": str(ai_result.get("reasoning", "")),
                "real_time_context": "",
                "key_factors": [],
                "evidence": [],
                "xai_analysis": ai_result,
                "action_summary": f"Skipped — {provider_label} unavailable",
            }

        direction = str(ai_result.get("direction", "SKIP") or "SKIP").strip().upper()
        if direction not in ("YES", "NO", "SKIP"):
            direction = "SKIP"

        ai_yes = _parse_ai_yes_pct(ai_result)
        strat = _enrich_strategy_fields(
            direction=direction,
            ai_yes_pct=ai_yes,
            current_prices=current_prices,
            bankroll=max(0.0, float(deployable_balance)),
        )

        decision = "SKIP"
        if direction == "YES":
            decision = "BUY_YES"
        elif direction == "NO":
            decision = "BUY_NO"

        reasoning_single = str(ai_result.get("reasoning", ""))
        ai_no = 100 - ai_yes
        side_label = "YES" if direction == "YES" else ("NO" if direction == "NO" else "—")
        ai_side_pct = ai_yes if direction == "YES" else (ai_no if direction == "NO" else 0)

        action_summary = (
            f"{'Buy' if decision != 'SKIP' else 'Skip'} {side_label} — "
            f"AI P(YES)={ai_yes}% · market implied {strat['market_implied_probability_pct']}% (buy side) · "
            f"edge {strat['edge_pct']:.1f} pts · Kelly {strat['kelly_contracts']} contracts"
        )

        return {
            **base,
            "decision": decision,
            "direction": direction,
            "ai_probability_yes_pct": ai_yes,
            "market_implied_probability_pct": strat["market_implied_probability_pct"],
            "edge_pct": strat["edge_pct"],
            "kelly_fraction": strat["kelly_fraction"],
            "kelly_contracts": strat["kelly_contracts"],
            "confidence": float(ai_yes) / 100.0,
            "yes_confidence": ai_yes,
            "no_confidence": ai_no,
            "reasoning": reasoning_single,
            "real_time_context": str(ai_result.get("real_time_context", "")),
            "key_factors": ai_result.get("key_factors", []) if isinstance(ai_result.get("key_factors", []), list) else [],
            "evidence": ai_result.get("evidence", []) if isinstance(ai_result.get("evidence", []), list) else [],
            "xai_analysis": ai_result,
            "action_summary": action_summary,
            "ai_probability_for_side_pct": int(ai_side_pct),
        }

    async def analyze_event_batch(
        self,
        *,
        event_ticker: str,
        event_title: str,
        legs: List[Dict[str, Any]],
        min_24h_volume_contracts: float = 0.0,
        min_top_ask_contracts: float = 0.0,
        max_spread: float = 0.15,
        deployable_balance: float = 0.0,
    ) -> Dict[str, Any]:
        """Single AI call over sibling markets; returns a decision payload for the **chosen** contract only."""
        if not legs:
            raise ValueError("legs must be non-empty")

        provider_label = ai_provider_display_name(self.ai_provider)
        xai_raw = await self._active_client().analyze_event_best_trade(
            event_ticker=event_ticker,
            event_title=event_title,
            legs=legs,
            temperature=self.temperature,
            min_24h_volume_contracts=min_24h_volume_contracts,
            min_top_ask_contracts=min_top_ask_contracts,
        )

        best_norm = normalize_market_id(str(xai_raw.get("best_market_id") or "")).upper()
        chosen: Optional[Dict[str, Any]] = None
        for leg in legs:
            if normalize_market_id(str(leg.get("market_id") or "")).upper() == best_norm:
                chosen = leg
                break
        if chosen is None:
            chosen = legs[0]

        mid = str(chosen.get("market_id") or "")
        m_title = str(chosen.get("market_title") or "")
        cp = chosen.get("current_prices") or {}
        yes_price = float(cp.get("yes", 0.5) or 0.5)
        no_price = float(cp.get("no", 0.5) or 0.5)

        base: Dict[str, Any] = {
            "decision_id": str(uuid.uuid4()),
            "market_id": mid,
            "market_title": m_title,
            "timestamp": utc_iso_z(utc_now()),
            "escalated_to_xai": True,
        }

        xai_analysis = {
            **{k: v for k, v in xai_raw.items() if k not in ("provider", "model")},
            "provider": str(xai_raw.get("provider") or self.ai_provider),
            "model": str(xai_raw.get("model") or getattr(self._active_client(), "model", "")),
            "event_batch": True,
            "event_ticker": event_ticker,
            "event_leg_count": len(legs),
            "event_batch_market_ids": [
                normalize_market_id(str(leg.get("market_id") or "")).strip().upper()
                for leg in legs
                if leg.get("market_id")
            ],
        }

        if "error" in xai_raw:
            _logger.warning("%s event batch error for %s: %s", provider_label, event_ticker, xai_raw.get("error"))
            return {
                **base,
                "decision": "SKIP",
                "direction": "SKIP",
                "ai_probability_yes_pct": 50,
                "market_implied_probability_pct": 0,
                "edge_pct": 0.0,
                "kelly_fraction": 0.0,
                "kelly_contracts": 0,
                "confidence": 0.5,
                "yes_confidence": int(yes_price * 100),
                "no_confidence": int(no_price * 100),
                "reasoning": str(xai_raw.get("reasoning", "")),
                "real_time_context": "",
                "key_factors": [],
                "evidence": [],
                "xai_analysis": xai_analysis,
                "action_summary": f"Skipped — {provider_label} batch unavailable",
            }

        direction = str(xai_raw.get("direction", "SKIP") or "SKIP").strip().upper()
        if direction not in ("YES", "NO", "SKIP"):
            direction = "SKIP"

        ai_yes = _parse_ai_yes_pct(xai_raw)

        batch_post_gate: Optional[str] = None
        orig_reasoning = str(xai_raw.get("reasoning", "") or "")
        if direction in ("YES", "NO"):
            leg_vol = float(chosen.get("volume") or 0.0)
            if min_24h_volume_contracts > 0 and leg_vol + 1e-9 < float(min_24h_volume_contracts):
                batch_post_gate = "volume_below_min"
                direction = "SKIP"
            else:
                side = "YES" if direction == "YES" else "NO"
                liq_fail = buy_side_liquidity_skip_summary(
                    _leg_book_as_market(chosen),
                    side,
                    max_spread=float(max_spread),
                    min_top_size=float(min_top_ask_contracts),
                )
                if liq_fail:
                    batch_post_gate = "buy_side_liquidity"
                    direction = "SKIP"

        strat = _enrich_strategy_fields(
            direction=direction,
            ai_yes_pct=ai_yes,
            current_prices=cp,
            bankroll=max(0.0, float(deployable_balance)),
        )

        decision = "SKIP"
        if direction == "YES":
            decision = "BUY_YES"
        elif direction == "NO":
            decision = "BUY_NO"

        reasoning_out = orig_reasoning
        if batch_post_gate == "volume_below_min":
            lv = float(chosen.get("volume") or 0.0)
            reasoning_out = (
                f"{orig_reasoning} [Batch post-check: chosen leg 24h volume {lv:.0f} "
                f"< minimum {float(min_24h_volume_contracts):.0f}.]"
            ).strip()
        elif batch_post_gate == "buy_side_liquidity":
            reasoning_out = (f"{orig_reasoning} [Batch post-check: {liq_fail}]").strip()

        ai_no = 100 - ai_yes
        side_label = "YES" if direction == "YES" else ("NO" if direction == "NO" else "—")
        action_summary = (
            f"Event batch ({len(legs)} legs): {'Buy' if decision != 'SKIP' else 'Skip'} {side_label} "
            f"on {mid} — AI P(YES)={ai_yes}% · implied {strat['market_implied_probability_pct']}% · "
            f"edge {strat['edge_pct']:.1f} pts · Kelly {strat['kelly_contracts']} contracts"
        )

        if batch_post_gate:
            xai_analysis["batch_post_gate"] = batch_post_gate
        xai_analysis["reasoning"] = reasoning_out

        return {
            **base,
            "decision": decision,
            "direction": direction,
            "ai_probability_yes_pct": ai_yes,
            "market_implied_probability_pct": strat["market_implied_probability_pct"],
            "edge_pct": strat["edge_pct"],
            "kelly_fraction": strat["kelly_fraction"],
            "kelly_contracts": strat["kelly_contracts"],
            "confidence": float(ai_yes) / 100.0,
            "yes_confidence": ai_yes,
            "no_confidence": ai_no,
            "reasoning": reasoning_out,
            "real_time_context": str(xai_raw.get("real_time_context", "")),
            "key_factors": xai_raw.get("key_factors", [])
            if isinstance(xai_raw.get("key_factors", []), list)
            else [],
            "evidence": xai_raw.get("evidence", []) if isinstance(xai_raw.get("evidence", []), list) else [],
            "xai_analysis": xai_analysis,
            "action_summary": action_summary,
            "ai_probability_for_side_pct": int(ai_yes if direction == "YES" else (ai_no if direction == "NO" else 0)),
        }
