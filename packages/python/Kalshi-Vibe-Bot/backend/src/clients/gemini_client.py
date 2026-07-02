"""
Google Gemini client for prediction market analysis.

Uses the same prompts and JSON parsing as xAI (Grok); only the HTTP transport differs.
See https://ai.google.dev/gemini-api/docs
"""

from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from src.bot.event_batch_partition import legs_are_all_line_ladder_partition
from src.decision_engine.ai_prompt_timing import build_ai_timing_for_prompt, build_ai_timing_for_prompt_from_market
from src.clients.xai_client import (
    EVENT_BATCH_SYSTEM_PROMPT,
    EVENT_BATCH_USER_TEMPLATE,
    SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE,
    _error_response,
    _format_event_batch_legs,
    _line_ladder_event_batch_block,
    _multi_outcome_event_batch_block,
    _parse_event_batch_json,
    _parse_json,
)
from src.logger import setup_logging
from src.reconcile.open_positions import normalize_market_id

_logger = setup_logging("gemini_client")

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"

_RETRYABLE_GEMINI_HTTP = frozenset({408, 429, 500, 502, 503, 504})
_GEMINI_HTTP_MAX_RETRIES = 3
_GEMINI_CHAT_TIMEOUT_SEC = 55.0
_GEMINI_EVENT_BATCH_TIMEOUT_SEC = 150.0
# Output token caps (thinking disabled via thinkingBudget=0).
_GEMINI_SINGLE_MAX_OUTPUT_TOKENS = 1024
_GEMINI_BATCH_MAX_OUTPUT_TOKENS = 4096
_GEMINI_MAX_OUTPUT_RETRY_MULTIPLIER = 2

_gemini_shared_http: Optional[httpx.AsyncClient] = None


def _gemini_http() -> httpx.AsyncClient:
    global _gemini_shared_http
    if _gemini_shared_http is None:
        _gemini_shared_http = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
            timeout=httpx.Timeout(60.0, connect=15.0),
        )
    return _gemini_shared_http


async def aclose_shared_gemini_http() -> None:
    """Release pooled Gemini HTTP connections (app shutdown)."""
    global _gemini_shared_http
    if _gemini_shared_http is not None:
        await _gemini_shared_http.aclose()
        _gemini_shared_http = None


def _gemini_retry_delay_seconds(attempt_index: int) -> float:
    base = min(25.0, (2**attempt_index) * 0.75)
    return base + random.uniform(0.15, 0.85)


def _extract_gemini_text(data: dict) -> Tuple[str, str]:
    """Return ``(text, finish_reason)`` from a generateContent response."""
    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("No candidates in Gemini response")
    c0 = candidates[0]
    finish = str(c0.get("finishReason") or "")
    content = c0.get("content") or {}
    parts = content.get("parts") or []
    texts: List[str] = []
    for part in parts:
        if isinstance(part, dict) and part.get("text"):
            texts.append(str(part["text"]))
    if not texts:
        raise ValueError("No text in Gemini response")
    return "\n".join(texts), finish


async def _post_gemini_generate_with_retries(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_output_tokens: int,
    timeout_sec: float,
    log_label: str,
    max_attempts: int,
) -> Tuple[str, Any]:
    """POST ``models/{model}:generateContent``. Returns ``("ok", response)`` or ``("err", message)``."""
    url = f"{GEMINI_API_BASE}/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    gen_cfg: dict = {
        "temperature": max(0.01, float(temperature)),
        "maxOutputTokens": int(max_output_tokens),
        "responseMimeType": "application/json",
        # gemini-2.5-flash defaults to heavy "thinking" that can consume the whole output budget
        # and truncate JSON; disable for structured trading outputs.
        "thinkingConfig": {"thinkingBudget": 0},
    }
    payload: dict = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": gen_cfg,
    }
    last_msg = "Request failed"
    http = _gemini_http()
    for attempt in range(max_attempts):
        try:
            resp = await http.post(url, json=payload, headers=headers, timeout=timeout_sec)
            if resp.is_success:
                return ("ok", resp)
            code = resp.status_code
            snippet = (resp.text or "")[:400]
            if code in _RETRYABLE_GEMINI_HTTP and attempt < max_attempts - 1:
                delay = _gemini_retry_delay_seconds(attempt)
                _logger.warning(
                    "Gemini HTTP %s for '%s' (%d/%d); retry in %.1fs — %s",
                    code,
                    log_label[:80],
                    attempt + 1,
                    max_attempts,
                    delay,
                    snippet[:160],
                )
                await asyncio.sleep(delay)
                continue
            _logger.error("Gemini %s for '%s': %s", code, log_label[:80], snippet)
            return ("err", f"HTTP {code}")
        except httpx.TimeoutException:
            last_msg = "Request timed out"
            if attempt < max_attempts - 1:
                delay = _gemini_retry_delay_seconds(attempt)
                _logger.warning(
                    "Gemini timeout for '%s' (%d/%d); retry in %.1fs",
                    log_label[:80],
                    attempt + 1,
                    max_attempts,
                    delay,
                )
                await asyncio.sleep(delay)
                continue
            _logger.warning("Gemini timeout for '%s' (exhausted)", log_label[:80])
            return ("err", last_msg)
        except httpx.RequestError as e:
            last_msg = str(e)
            if attempt < max_attempts - 1:
                delay = _gemini_retry_delay_seconds(attempt)
                _logger.warning(
                    "Gemini transport error for '%s' (%d/%d): %s; retry in %.1fs",
                    log_label[:80],
                    attempt + 1,
                    max_attempts,
                    e,
                    delay,
                )
                await asyncio.sleep(delay)
                continue
            _logger.error("Gemini transport error for '%s': %s", log_label[:80], e)
            return ("err", last_msg)
        except Exception as e:
            _logger.error("Gemini error for '%s': %s", log_label[:80], e)
            return ("err", str(e))
    return ("err", last_msg)


async def _gemini_generate_json_text(
    *,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_output_tokens: int,
    timeout_sec: float,
    log_label: str,
) -> Tuple[str, str]:
    """Call Gemini and return ``(text, finish_reason)``; retries once on ``MAX_TOKENS``."""
    cap = int(max_output_tokens)
    for attempt in range(2):
        tok = cap if attempt == 0 else min(8192, cap * _GEMINI_MAX_OUTPUT_RETRY_MULTIPLIER)
        outcome, resp_or_msg = await _post_gemini_generate_with_retries(
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_output_tokens=tok,
            timeout_sec=timeout_sec,
            log_label=log_label,
            max_attempts=_GEMINI_HTTP_MAX_RETRIES,
        )
        if outcome != "ok":
            raise RuntimeError(str(resp_or_msg))
        data = resp_or_msg.json()
        text, finish = _extract_gemini_text(data)
        if finish != "MAX_TOKENS":
            return text, finish
        _logger.warning(
            "Gemini MAX_TOKENS for '%s' at %d output tokens; %s",
            log_label[:80],
            tok,
            "retrying with higher cap" if attempt == 0 else "using truncated body",
        )
    return text, finish


class GeminiClient:
    """Gemini client: same outcome-first prompts as Grok; Google generateContent transport."""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash"):
        self.api_key = api_key
        self.model = model

    async def analyze_market(
        self,
        market_title: str,
        market_description: str,
        current_prices: dict,
        volume: float,
        expires_in_days: float = 1.0,
        close_time: Optional[str] = None,
        expected_expiration_time: Optional[str] = None,
        vetting_horizon_time: Optional[str] = None,
        market_timing: Optional[Dict[str, Any]] = None,
        temperature: float = 0.1,
    ) -> dict:
        """Analyze a prediction market using Gemini."""
        yes_price = current_prices.get("yes", 0.5)
        no_price = current_prices.get("no", 0.5)

        yes_bid = current_prices.get("yes_bid")
        yes_ask = current_prices.get("yes_ask")
        no_bid = current_prices.get("no_bid")
        no_ask = current_prices.get("no_ask")
        yes_ask_size = current_prices.get("yes_ask_size")
        no_ask_size = current_prices.get("no_ask_size")
        local_vetting_notes = str(current_prices.get("local_vetting_notes") or "").strip()

        def _px_str(v):
            try:
                return f"${float(v):.3f}"
            except Exception:
                return "N/A"

        def _size_str(v):
            try:
                return f"{float(v):.0f}"
            except Exception:
                return "N/A"

        if market_timing:
            timing = build_ai_timing_for_prompt_from_market(market_timing)
        else:
            timing = build_ai_timing_for_prompt(
                expected_expiration_time=expected_expiration_time,
                vetting_horizon_time=vetting_horizon_time,
                close_time=close_time,
                expires_in_days_fallback=float(expires_in_days),
            )

        user_prompt = USER_PROMPT_TEMPLATE.format(
            market_title=market_title,
            market_description=market_description,
            now_utc=timing["now_utc"],
            resolution_at_utc=timing["resolution_at_utc"],
            resolution_at_et=timing["resolution_at_et"],
            time_until_resolution=timing["time_until_resolution"],
            yes_price=yes_price,
            no_price=no_price,
            yes_pct=yes_price * 100,
            no_pct=no_price * 100,
            volume=volume,
            time_desc=timing["time_desc"],
            yes_bid_str=_px_str(yes_bid),
            yes_ask_str=_px_str(yes_ask),
            no_bid_str=_px_str(no_bid),
            no_ask_str=_px_str(no_ask),
            yes_ask_size_str=_size_str(yes_ask_size),
            no_ask_size_str=_size_str(no_ask_size),
            local_vetting_notes=local_vetting_notes or "None",
        )

        try:
            content, _finish = await _gemini_generate_json_text(
                api_key=self.api_key,
                model=self.model,
                system_prompt=SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=temperature,
                max_output_tokens=_GEMINI_SINGLE_MAX_OUTPUT_TOKENS,
                timeout_sec=_GEMINI_CHAT_TIMEOUT_SEC,
                log_label=market_title,
            )
            result = _parse_json(content)
            _logger.debug(
                "Gemini direction=%s ai_yes_pct=%s for '%s'",
                result.get("direction"),
                result.get("ai_probability_yes_pct"),
                market_title[:60],
            )
            return {"provider": "gemini", "model": self.model, **result}
        except Exception as e:
            _logger.error("Gemini error for '%s': %s", market_title[:60], e)
            return _error_response(str(e))

    async def analyze_event_best_trade(
        self,
        *,
        event_ticker: str,
        event_title: str,
        legs: List[Dict[str, Any]],
        temperature: float = 0.1,
        min_24h_volume_contracts: float = 0.0,
        min_top_ask_contracts: float = 0.0,
    ) -> dict:
        """One Gemini call over sibling markets under the same ``event_ticker``."""
        if not legs:
            return {**_error_response("No contracts in batch"), "best_market_id": ""}

        now_utc = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        lines_blk: List[str] = []
        if min_24h_volume_contracts > 0:
            lines_blk.append(
                f"- Minimum 24h traded contracts (use each leg's `24h volume` line): >= {min_24h_volume_contracts:.0f}"
            )
        if min_top_ask_contracts > 0:
            lines_blk.append(
                f"- Minimum top-of-book ask size on the **outcome side you would buy** (use the ask size on that side’s line in BOOK): >= {min_top_ask_contracts:.0f} contracts"
            )
        if lines_blk:
            batch_config_block = (
                "BOT FILTER ALIGNMENT (same thresholds the bot's scan uses; your best pick must satisfy these for your direction):\n"
                + "\n".join(lines_blk)
                + "\n\nIf no sibling meets both applicable lines for a directional trade, output direction SKIP.\n\n"
            )
        else:
            batch_config_block = ""

        legs_text = _format_event_batch_legs(legs)
        ladder = legs_are_all_line_ladder_partition(legs)
        user_prompt = EVENT_BATCH_USER_TEMPLATE.format(
            event_title=event_title or event_ticker,
            event_ticker=event_ticker,
            now_utc=now_utc,
            batch_config_block=batch_config_block,
            multi_outcome_block=_multi_outcome_event_batch_block(legs),
            line_ladder_block=_line_ladder_event_batch_block(legs) if ladder else "",
            legs_text=legs_text,
        )

        allowed = {
            normalize_market_id(str(leg.get("market_id") or "")).upper()
            for leg in legs
            if leg.get("market_id")
        }
        fallback_best = str(legs[0].get("market_id") or "")

        try:
            content, _finish = await _gemini_generate_json_text(
                api_key=self.api_key,
                model=self.model,
                system_prompt=EVENT_BATCH_SYSTEM_PROMPT,
                user_prompt=user_prompt,
                temperature=temperature,
                max_output_tokens=_GEMINI_BATCH_MAX_OUTPUT_TOKENS,
                timeout_sec=_GEMINI_EVENT_BATCH_TIMEOUT_SEC,
                log_label=f"batch:{event_ticker}",
            )
            parsed = _parse_event_batch_json(content, allowed_ids=allowed, ladder_stat_line_batch=ladder)
            _logger.debug(
                "Gemini event batch %s best=%s dir=%s",
                event_ticker,
                parsed.get("best_market_id"),
                parsed.get("direction"),
            )
            return {"provider": "gemini", "model": self.model, **parsed}
        except Exception as e:
            _logger.error("Gemini batch error for %s: %s", event_ticker, e)
            return {**_error_response(str(e)), "best_market_id": fallback_best}
