"""
xAI (Grok) client for prediction market analysis.

Prompts are tuned for **hold-to-resolution / stop-loss** trading: Grok must estimate which
side actually wins at settlement, using fundamentals and live context—not relative-value
or “cheap vs expensive” positioning within the quoted book.

Evidence is steered to **time-to-close**: drivers that matter **now → settlement**, with
lookback scaled per market (hours/days vs weeks vs longer) rather than multi-year noise
for imminent resolutions.
"""

import asyncio
import json
import random
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from src.bot.event_batch_partition import legs_are_all_line_ladder_partition
from src.clients.ai_json_parse import loads_json_object
from src.decision_engine.ai_prompt_timing import build_ai_timing_for_prompt, build_ai_timing_for_prompt_from_market
from src.logger import setup_logging
from src.reconcile.open_positions import normalize_market_id

_logger = setup_logging("xai_client")

XAI_BASE_URL = "https://api.x.ai/v1"
XAI_MANAGEMENT_BASE_URL = "https://management-api.x.ai"

# xAI Management API: money objects use ``{"val": "<string>"}`` as **USD cents** in the paths we use.
_XAI_USD_CENTS_TO_USD = 1.0 / 100.0

# Status codes where xAI or intermediaries often recover quickly — worth a short backoff retry.
_RETRYABLE_XAI_HTTP = frozenset({408, 429, 500, 502, 503, 504})

# Inference HTTP behavior (not env-tunable).
_XAI_HTTP_MAX_RETRIES = 3
_XAI_CHAT_TIMEOUT_SEC = 55.0
_XAI_EVENT_BATCH_TIMEOUT_SEC = 150.0

_xai_shared_http: Optional[httpx.AsyncClient] = None


def _xai_http() -> httpx.AsyncClient:
    global _xai_shared_http
    if _xai_shared_http is None:
        _xai_shared_http = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=8, max_connections=16),
            timeout=httpx.Timeout(60.0, connect=15.0),
        )
    return _xai_shared_http


async def aclose_shared_xai_http() -> None:
    """Release pooled xAI HTTP connections (app shutdown)."""
    global _xai_shared_http
    if _xai_shared_http is not None:
        await _xai_shared_http.aclose()
        _xai_shared_http = None


def _xai_retry_delay_seconds(attempt_index: int) -> float:
    base = min(25.0, (2**attempt_index) * 0.75)
    return base + random.uniform(0.15, 0.85)


async def _post_xai_chat_with_retries(
    *,
    api_key: str,
    payload: dict,
    timeout_sec: float,
    log_label: str,
    max_attempts: int,
) -> Tuple[str, Any]:
    """POST ``/chat/completions`` with retries. Returns ``("ok", response)`` or ``("err", message)``."""
    url = f"{XAI_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    last_msg = "Request failed"
    http = _xai_http()
    for attempt in range(max_attempts):
        try:
            resp = await http.post(url, json=payload, headers=headers, timeout=timeout_sec)
            if resp.is_success:
                return ("ok", resp)
            code = resp.status_code
            snippet = (resp.text or "")[:400]
            if code in _RETRYABLE_XAI_HTTP and attempt < max_attempts - 1:
                delay = _xai_retry_delay_seconds(attempt)
                _logger.warning(
                    "xAI HTTP %s for '%s' (%d/%d); retry in %.1fs — %s",
                    code,
                    log_label[:80],
                    attempt + 1,
                    max_attempts,
                    delay,
                    snippet[:160],
                )
                await asyncio.sleep(delay)
                continue
            _logger.error("xAI %s for '%s': %s", code, log_label[:80], snippet)
            return ("err", f"HTTP {code}")
        except httpx.TimeoutException:
            last_msg = "Request timed out"
            if attempt < max_attempts - 1:
                delay = _xai_retry_delay_seconds(attempt)
                _logger.warning(
                    "xAI timeout for '%s' (%d/%d); retry in %.1fs",
                    log_label[:80],
                    attempt + 1,
                    max_attempts,
                    delay,
                )
                await asyncio.sleep(delay)
                continue
            _logger.warning("xAI timeout for '%s' (exhausted)", log_label[:80])
            return ("err", last_msg)
        except httpx.RequestError as e:
            last_msg = str(e)
            if attempt < max_attempts - 1:
                delay = _xai_retry_delay_seconds(attempt)
                _logger.warning(
                    "xAI transport error for '%s' (%d/%d): %s; retry in %.1fs",
                    log_label[:80],
                    attempt + 1,
                    max_attempts,
                    e,
                    delay,
                )
                await asyncio.sleep(delay)
                continue
            _logger.error("xAI transport error for '%s': %s", log_label[:80], e)
            return ("err", last_msg)
        except Exception as e:
            _logger.error("xAI error for '%s': %s", log_label[:80], e)
            return ("err", str(e))
    return ("err", last_msg)


def _xai_money_object_cents(obj: object) -> Optional[float]:
    if not isinstance(obj, dict):
        return None
    raw = obj.get("val")
    if raw is None:
        return None
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        return None


def prepaid_remaining_usd_from_invoice_preview_json(data: dict) -> Optional[float]:
    """Remaining prepaid USD for the **current billing cycle** (matches xAI console usage snapshot).

    Source: ``GET /v1/billing/teams/{team_id}/postpaid/invoice/preview`` — ``coreInvoice`` includes
    ``prepaidCredits`` and ``prepaidCreditsUsed`` (USD cents; live responses use negative strings).
    Remaining = ``abs(prepaid_cents) - abs(used_cents)`` (e.g. ``-3816`` and ``-1373`` → ``$24.43``).

    ``GET …/prepaid/balance`` does **not** match that console figure (different ledger; ``total`` can
    be e.g. ``-4131`` while preview shows cycle totals).
    """
    if not isinstance(data, dict):
        return None
    ci = data.get("coreInvoice")
    if not isinstance(ci, dict):
        return None
    pc = _xai_money_object_cents(ci.get("prepaidCredits"))
    if pc is None:
        return None
    pu = _xai_money_object_cents(ci.get("prepaidCreditsUsed")) or 0.0
    remaining_cents = abs(pc) - abs(pu)
    if remaining_cents != remaining_cents:  # NaN
        return None
    return float(remaining_cents * _XAI_USD_CENTS_TO_USD)


async def fetch_xai_prepaid_balance_usd(*, management_api_key: str, team_id: str) -> Optional[float]:
    """Return remaining prepaid balance in USD for the current billing cycle, or ``None`` on failure.

    Uses ``GET`` ``/v1/billing/teams/{team_id}/postpaid/invoice/preview`` (same view as the console
    usage snapshot), not ``…/prepaid/balance``.
    """
    tid = (team_id or "").strip()
    key = (management_api_key or "").strip()
    if not tid or not key:
        return None
    url = f"{XAI_MANAGEMENT_BASE_URL}/v1/billing/teams/{tid}/postpaid/invoice/preview"
    try:
        http = _xai_http()
        resp = await http.get(
            url,
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json"},
            timeout=12.0,
        )
        if not resp.is_success:
            _logger.debug(
                "xAI invoice preview HTTP %s: %s",
                resp.status_code,
                (resp.text or "")[:200],
            )
            return None
        data = resp.json()
        return prepaid_remaining_usd_from_invoice_preview_json(data if isinstance(data, dict) else {})
    except httpx.TimeoutException:
        _logger.debug("xAI invoice preview request timed out")
        return None
    except Exception as e:
        _logger.debug("xAI invoice preview: %s", e)
        return None

SYSTEM_PROMPT = """You advise an automated trader on Kalshi contracts held to resolution (optional stop-loss). Output **JSON only** (no markdown).

Each contract is still a **binary** YES/NO ticket, but some events list **several sibling contracts** where **at most one** YES can win (e.g. soccer **home win / away win / draw**). Then **P(YES)** on one leg is **not** independent of the others: those YES probabilities over the listed outcomes should **partition** ~100% (draw is a first-class outcome; buying NO on \"Team A wins\" is exposure to **both** the other win and a tie).

Goal: estimate **P(YES)** — the probability **this** contract settles YES — using **real-time, horizon-matched** facts and the contract's resolution logic. If unclear or the book/liquidity is poor, output direction SKIP.

**Threshold vs exact-hit:** Many Kalshi markets (crypto 15m, index levels, weather highs) use a numeric **threshold**: YES if the settlement index is **above** (or below) a stated level at expiration; NO otherwise. Labels like **"Target Price: $X"** are the comparison level — **not** a requirement that the index land exactly on $X. Never assign near-zero P(YES) on a standard above-threshold leg solely because exact equality is unlikely. Follow the **RESOLUTION** block in the user prompt when present.

**Time / clock:** Use the server **CLOCK** block (UTC now, resolution anchor UTC + US/Eastern, **time until resolution**). Trust it over calendar-date guesses. Example: 10:00 PM EDT on May 17 equals 02:00 UTC on May 18 — at 01:44 UTC May 18 there are **16 minutes left**; do **not** treat the event as past just because the UTC date is May 18. While **time until resolution** shows positive minutes, do not claim the contract already expired.

Use quotes/book **secondarily**: they inform whether a trade is worthwhile; poor liquidity can justify SKIP. Treat market-implied odds as informed sentiment; if your view diverges sharply from the market, explain the wedge in **reasoning** or choose **SKIP**.

Do not choose a side mainly because it looks cheap/rich. Never recommend the side you think is less likely to win.

**Calibration:** If you report **ai_probability_yes_pct** above **75** while the executable ask on your buy side is **40–65¢**, lower your probability or **SKIP** unless you have strong, specific evidence—the market is pricing meaningful risk. Treat implied edge above **~20 percentage points** as a warning sign of overconfidence unless you can defend it point-by-point; otherwise **SKIP**.

The server computes edge and full Kelly **order sizing** from your **ai_probability_yes_pct** and executable asks (whole contracts, cash-capped; may use exactly **one** contract when fractional Kelly is below one contract but edge at the ask remains). Keep that field calibrated and honest."""

USER_PROMPT_TEMPLATE = """Forecast **which side wins at resolution** for this contract. Recommend **YES** or **NO** only when that matches your genuine outcome view—not because either side looks under/overpriced.

═══════════════════════════════════════════════════════
MARKET: {market_title}
DESCRIPTION: {market_description}
CLOCK (server-authoritative — use for before/after resolution; do not infer from title timezone alone):
  NOW (UTC): {now_utc}
  Resolution anchor (UTC): {resolution_at_utc}
  Resolution anchor (US/Eastern): {resolution_at_et}
  Time until resolution: {time_until_resolution}
═══════════════════════════════════════════════════════
MARKET QUOTES — **sentiment baseline** (use with fundamentals; do not flip sides on price alone):
  YES: ${yes_price:.3f}  →  ~{yes_pct:.1f}% market-implied for YES
  NO:  ${no_price:.3f}  →  ~{no_pct:.1f}% market-implied for NO
  If you recommend buying YES while YES is priced **far below** your P(YES)—or buying NO while NO is priced far below your P(NO)—**reasoning** must explain that wedge or choose **SKIP**.

MARKET MICROSTRUCTURE (**secondary** — can justify **SKIP**; never replace outcome logic):
  YES bid/ask: {yes_bid_str} / {yes_ask_str} (top ask size: {yes_ask_size_str})
  NO  bid/ask: {no_bid_str} / {no_ask_str} (top ask size: {no_ask_size_str})
  24h Volume: {volume:.0f} contracts
  Time remaining: {time_desc}

**Decision horizon for this contract:** **now → close** ({time_desc}). Judge drivers by strength **inside this interval** only; longer history is admissible **only** if it genuinely informs settlement **within that window** (explain briefly in **reasoning**).

Consider spread vs mid, displayed depth on the side you would buy, volume vs urgency of expiry, and simple **imbalances** (e.g. bid vs ask size or missing quotes) as inputs to how confident you are that expressing your view is **worthwhile**, not as the primary reason to flip sides.

LOCAL VETTING NOTES:
  {local_vetting_notes}

Use external context **when temporally relevant**: breaking news and calendars inside the horizon, near-term forecasts, flows/sentiment as weak signals, and analog events with **similar time scale** to time-to-close.

In **reasoning**, briefly show: (1) resolution logic; (2) your P(YES) view **for this horizon**; (3) how **Kalshi-implied odds** compare to your probability—if they diverge a lot, say **why** you still buy that side or why you skip; (4) how **liquidity/spread** affected your decision.

Fill **real_time_context** with drivers credible **now through close** (approximate timing). Omit stale-era summaries that do not bear on this window (or ``None found``).

If recommending YES/NO: include ≥1 **evidence** item that bears on **who wins**; you may add **key_factors** for liquidity/spread concerns.

Output strict JSON only:
{{
    "direction": "<YES | NO | SKIP>",
    "ai_probability_yes_pct": <integer 0-100 — your subjective probability YES resolves>,
    "reasoning": "<2-5 sentences>",
    "real_time_context": "<short bullet summary or 'None found'>",
    "key_factors": ["<factor>", "<factor>", "<factor>"],
    "evidence": [
        {{
            "claim": "<what this evidence supports>",
            "source": "<who/where>",
            "when": "<date or time window>",
            "link": "<optional>"
        }}
    ]
}}"""

# Line-ladder batches: switch to a sibling leg when its P(YES) beats the model pick by at least this much.
_LADDER_LIKELIHOOD_OVERRIDE_MIN_GAP_PCT = 5

EVENT_BATCH_SYSTEM_PROMPT = """You compare multiple sibling Kalshi contracts under one event. Output **JSON only**.

Pick **at most one** contract+side (market_id + YES/NO) based on fundamentals: which side is most likely to win **by that leg's close**. Do not optimize for relative mispricing, “better payout,” or higher edge on a **riskier** sibling strike when another listed leg is **clearly more likely** to win (e.g. a lower over-goals line you call “very likely”).

When **three or more** legs are listed and they are **mutually exclusive** on the YES side (typical match-winner triplet including a **tie** contract), treat YES probabilities as a **partition**: only one leg can settle YES; your per-leg P(YES) estimates over those legs should sum to about **100%**, and **reasoning** must reflect draw risk explicitly. Still output **ai_probability_yes_pct** as **P(this contract settles YES)** for **best_market_id** (even when direction is NO — that field is always the YES-win chance for the chosen ticker).

**Numeric stat thresholds** (e.g. different strikeout **lines** like 5+ vs 7+ Ks) are **not** a single-winner partition: **multiple** YES legs can win together if the stat clears multiple hurdles; different **players** in the same game each have **independent** YES/NO settlements—never force their YES probabilities to sum to ~100% across players.

Use book/quotes/volume secondarily; poor liquidity can justify SKIP. If your pick is a market-priced longshot, justify the wedge concretely or SKIP.

**Edge discipline:** If your implied edge on the buy side would exceed **~20 points**, treat that as a red flag—re-check calibration or **SKIP** unless evidence is overwhelming. Do not chase “great value” on unlikely outcomes.

Rules: best_market_id must be one from the list (if SKIP, use the first). direction applies to that contract only. Honor BOT FILTER ALIGNMENT if present.

The server computes edge and Kelly **order sizing** from **ai_probability_yes_pct** (for the chosen contract) and executable asks (whole contracts, cash-capped; may use exactly **one** contract when fractional Kelly is below one contract but edge at the ask remains)."""

EVENT_BATCH_USER_TEMPLATE = """EVENT (shared): {event_title}
EVENT_TICKER: {event_ticker}
NOW (UTC): {now_utc}
{batch_config_block}Below are **separate Kalshi contracts** (each has its own YES/NO settlement). The bot may buy **only one** contract side in this entire event this round.

{multi_outcome_block}{line_ladder_block}
**Task:** Choose the **single** ``market_id`` and **YES** or **NO** that you believe is **most likely to win at resolution**—using fundamentals and **horizon-matched** news/data (see each leg’s expiry line). **Do not** optimize for “best value,” extra edge, or higher payout on a **less likely** sibling (e.g. do **not** buy Over 3.5 for “better return” when Over 2.5 is the side you judge **most likely** to win).

**Horizon:** Siblings often share a similar **now → close** window—anchor reasoning and **real_time_context** to drivers valid **through that window**. Lookback length is **market-dependent**: intraday/near-term underlyings need very fresh inputs; slower domains may justify weeks–months only when they still bind settlement timing.

**Also:** After fixing outcome preference, use **per-leg YES/NO mids** as **baseline sentiment**: if your fundamental pick is priced like a longshot, **ai_probability_yes_pct** must reflect that tension unless **reasoning** explains the wedge. Use **spread, sizes, volume** the same way—still **never** picking the side you expect to lose.

Use live/public knowledge where it sharpens the forecast **for this horizon**. Compare strikes only to see **which question** you can forecast best, not which price looks farthest from fair.

For your pick, **real_time_context** should summarize inputs operative **now through that contract’s close**; mention notable **market-structure** factors there if they drove SKIP or a cautious probability.

If you recommend a direction: **evidence** must support **outcome** (which side wins); use **key_factors** for liquidity/spread/volume **and**, when relevant, **why Kalshi’s implied odds differ from your view**.

{legs_text}

OUTPUT JSON ONLY:
{{
  "best_market_id": "<exact market_id from the list above>",
  "direction": "<YES | NO | SKIP>",
  "ai_probability_yes_pct": <integer 0-100 for the CHOSEN contract — P(that contract settles YES) at resolution>,
  "outcome_probability_pct_by_market_id": {{ "<market_id_from_list>": <int 0-100>, "...": <int> }},
  "reasoning": "<2-6 sentences: chosen contract, resolution logic, why the chosen side likely wins—avoid framing around mispricing alone>",
  "real_time_context": "<short factual/sentiment snapshot or 'None found'>",
  "key_factors": ["<factor>", "..."],
  "evidence": [
    {{"claim": "<...>", "source": "<...>", "when": "<...>", "link": "<optional>"}}
  ]
}}

Include **outcome_probability_pct_by_market_id** when the legs are **mutually exclusive on YES** (only one can settle YES — e.g. home / away / **draw**). Keys must be **exact** ``market_id`` strings from the list; values are your P(YES) for each; they must **sum to 99–101** across **all listed legs** in that case. Omit this field (or use null) only when legs are clearly **not** such a partition (e.g. unrelated props)."""


class XAIClient:
    """xAI Grok client: outcome-first P(YES); microstructure informs SKIP."""

    def __init__(self, api_key: str, model: str = "grok-3"):
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
        """Analyze a prediction market using Grok with real-time context."""
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

        payload: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": max(0.01, temperature),
            "max_tokens": 650,
        }

        # Request JSON output if the model supports it
        try:
            payload["response_format"] = {"type": "json_object"}
        except Exception:
            pass

        try:
            outcome, resp_or_msg = await _post_xai_chat_with_retries(
                api_key=self.api_key,
                payload=payload,
                timeout_sec=_XAI_CHAT_TIMEOUT_SEC,
                log_label=market_title,
                max_attempts=_XAI_HTTP_MAX_RETRIES,
            )
            if outcome != "ok":
                return _error_response(str(resp_or_msg))
            resp = resp_or_msg
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            result = _parse_json(content)
            _logger.debug(
                "xAI direction=%s ai_yes_pct=%s for '%s'",
                result.get("direction"),
                result.get("ai_probability_yes_pct"),
                market_title[:60],
            )
            return {"provider": "xai", "model": self.model, **result}
        except Exception as e:
            _logger.error("xAI error for '%s': %s", market_title[:60], e)
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
        """One Grok call over sibling markets under the same ``event_ticker``; returns batch-shaped dict."""
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
        payload: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": EVENT_BATCH_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": max(0.01, float(temperature)),
            "max_tokens": 2200,
        }
        try:
            payload["response_format"] = {"type": "json_object"}
        except Exception:
            pass

        allowed = {
            normalize_market_id(str(leg.get("market_id") or "")).upper()
            for leg in legs
            if leg.get("market_id")
        }

        fallback_best = str(legs[0].get("market_id") or "")
        try:
            outcome, resp_or_msg = await _post_xai_chat_with_retries(
                api_key=self.api_key,
                payload=payload,
                timeout_sec=_XAI_EVENT_BATCH_TIMEOUT_SEC,
                log_label=f"batch:{event_ticker}",
                max_attempts=_XAI_HTTP_MAX_RETRIES,
            )
            if outcome != "ok":
                return {**_error_response(str(resp_or_msg)), "best_market_id": fallback_best}
            resp = resp_or_msg
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            parsed = _parse_event_batch_json(content, allowed_ids=allowed, ladder_stat_line_batch=ladder)
            _logger.debug(
                "xAI event batch %s best=%s dir=%s",
                event_ticker,
                parsed.get("best_market_id"),
                parsed.get("direction"),
            )
            return {"provider": "xai", "model": self.model, **parsed}
        except Exception as e:
            _logger.error("xAI batch error for %s: %s", event_ticker, e)
            return {**_error_response(str(e)), "best_market_id": fallback_best}


# ── helpers ────────────────────────────────────────────────────────────────────


def _multi_outcome_event_batch_block(legs: List[Dict[str, Any]]) -> str:
    """When several siblings are scanned together, remind the model about 1X2 / tie partitions."""
    if legs_are_all_line_ladder_partition(legs):
        return ""
    if len(legs) < 3:
        return ""
    ids: List[str] = []
    for leg in legs:
        mid = normalize_market_id(str(leg.get("market_id") or "")).upper()
        if mid:
            ids.append(mid)
    if len(ids) < 3:
        return ""
    joined = ", ".join(ids)
    return (
        "### Multi-outcome note (three or more legs in this batch)\n"
        f"**Market ids in this batch:** {joined}\n"
        "If these contracts are a **match-style decomposition** (only one can settle YES — e.g. home / away / **draw**), "
        "treat each leg’s YES as **mutually exclusive**: fill **outcome_probability_pct_by_market_id** with **every** "
        "``market_id`` above so the integers **sum to 99–101**, and make **reasoning** explicit about **draw** risk "
        "(or whichever leg encodes a tie). Buying YES on \"Team A wins\" does **not** pay on a draw.\n\n"
    )


def _line_ladder_event_batch_block(legs: List[Dict[str, Any]]) -> str:
    """Clarify nested numeric-line props so the model does not apply 1X2 partition math."""
    if len(legs) < 2:
        return ""
    ids = [normalize_market_id(str(leg.get("market_id") or "")).upper() for leg in legs if leg.get("market_id")]
    joined = ", ".join(ids)
    return (
        "### Numeric line ladder (this batch)\n"
        f"**Market ids:** {joined}\n"
        "These legs are **threshold / over-style** questions (often same player or same total-goals ladder, different cutoffs). "
        "**Several** can settle YES together if the realized stat clears multiple lines — probabilities are **independent**, "
        "not a ~100% partition.\n"
        "**Required:** fill ``outcome_probability_pct_by_market_id`` with your P(YES) for **every** listed ``market_id`` "
        "(integers 0–100; they do **not** need to sum to 100).\n"
        "**Pick rule:** choose ``best_market_id`` + direction for the leg whose **chosen side** has the **highest** win "
        "probability among siblings — for YES picks, the leg with the **highest** P(YES); for NO picks, the leg with the "
        "**lowest** P(YES) (highest P(NO)). If you call a lower line “very likely” / “highly likely,” you must pick that "
        "line (YES on the lower over, or the corresponding NO on the highest line), not a riskier line for extra edge.\n\n"
    )


def _format_event_batch_legs(legs: List[Dict[str, Any]]) -> str:
    lines: List[str] = []
    for i, leg in enumerate(legs, start=1):
        mid = str(leg.get("market_id") or "").strip()
        title = str(leg.get("market_title") or "").strip()
        desc = str(leg.get("market_description") or "").strip()
        cp = leg.get("current_prices") or {}
        vol = float(leg.get("volume") or 0.0)
        leg_timing = build_ai_timing_for_prompt_from_market(leg)

        def _px(v: Any) -> str:
            try:
                return f"${float(v):.3f}"
            except (TypeError, ValueError):
                return "N/A"

        yes_bid = cp.get("yes_bid")
        yes_ask = cp.get("yes_ask")
        no_bid = cp.get("no_bid")
        no_ask = cp.get("no_ask")
        yas = cp.get("yes_ask_size")
        nas = cp.get("no_ask_size")
        def _sz(v: Any) -> str:
            try:
                return f"{float(v):.0f}"
            except (TypeError, ValueError):
                return "N/A"

        lines.append(
            f"### {i}) market_id: {mid}\n"
            f"TITLE: {title}\n"
            f"DESCRIPTION: {desc}\n"
            f"YES mid/executable: {_px(cp.get('yes'))} | NO: {_px(cp.get('no'))}\n"
            f"BOOK: YES bid/ask {_px(yes_bid)}/{_px(yes_ask)} (ask size {_sz(yas)}) | "
            f"NO bid/ask {_px(no_bid)}/{_px(no_ask)} (ask size {_sz(nas)})\n"
            f"24h volume: {vol:.0f} contracts\n"
            f"CLOCK: now_utc={leg_timing['now_utc']} | resolution_utc={leg_timing['resolution_at_utc']} | "
            f"resolution_et={leg_timing['resolution_at_et']} | {leg_timing['time_until_resolution']}\n"
        )
    return "\n".join(lines)


def _extract_ai_probability_yes_pct(result: dict) -> int:
    """Normalize model output to 0–100 P(YES); supports legacy confidence-style keys."""
    if not isinstance(result, dict):
        return 50
    raw = result.get("ai_probability_yes_pct")
    if raw is None:
        raw = result.get("confidence_pct")
    if raw is None and result.get("yes_confidence") is not None:
        try:
            raw = int(result.get("yes_confidence"))
        except Exception:
            raw = None
    try:
        v = int(raw if raw is not None else 50)
    except Exception:
        v = 50
    return max(0, min(100, v))


def _normalize_outcome_probability_pct_by_market_id(
    raw: Any,
    *,
    allowed_ids: Set[str],
) -> Optional[Dict[str, int]]:
    """Clamp model-supplied per-leg P(YES) map to allowed market ids (uppercase keys)."""
    if raw is None or raw is False:
        return None
    if not isinstance(raw, dict):
        return None
    out: Dict[str, int] = {}
    for k, v in raw.items():
        kn = normalize_market_id(str(k or "")).upper()
        if kn not in allowed_ids:
            continue
        try:
            iv = int(round(float(v)))
        except (TypeError, ValueError):
            continue
        out[kn] = max(0, min(100, iv))
    return out or None


def _prioritize_line_ladder_likelihood(
    parsed: Dict[str, Any],
    *,
    allowed_ids: Set[str],
    min_gap_pct: int = _LADDER_LIKELIHOOD_OVERRIDE_MIN_GAP_PCT,
) -> Dict[str, Any]:
    """Prefer the sibling leg with highest P(chosen side wins); overrides model pick when gap is large enough."""
    direction = str(parsed.get("direction") or "SKIP").upper()
    if direction not in ("YES", "NO"):
        return parsed

    omap = parsed.get("outcome_probability_pct_by_market_id")
    if not isinstance(omap, dict):
        return parsed

    present = {k: int(v) for k, v in omap.items() if k in allowed_ids}
    if len(present) < 2:
        return parsed

    model_best = str(parsed.get("best_market_id") or "").strip().upper()
    if not model_best or model_best not in present:
        return parsed

    if direction == "YES":
        likelihood_best = max(present, key=present.get)
    else:
        likelihood_best = min(present, key=present.get)

    model_p = present[model_best]
    best_p = present[likelihood_best]
    if likelihood_best == model_best:
        return parsed
    if direction == "YES":
        if best_p < model_p + min_gap_pct:
            return parsed
    elif model_p < best_p + min_gap_pct:
        return parsed

    out = dict(parsed)
    out["best_market_id"] = likelihood_best
    out["ai_probability_yes_pct"] = best_p
    side_label = "P(YES)" if direction == "YES" else "P(NO) implied via P(YES)"
    note = (
        f" [Likelihood priority: switched from {model_best} ({model_p}% P(YES)) to "
        f"{likelihood_best} ({best_p}% P(YES)) — higher {side_label} among ladder legs; "
        f"do not favor a riskier strike for extra edge when a sibling is more likely.]"
    )
    out["reasoning"] = (str(out.get("reasoning") or "").strip() + note).strip()
    out["batch_likelihood_override"] = True
    return out


def _parse_event_batch_json(
    content: str,
    *,
    allowed_ids: Set[str],
    ladder_stat_line_batch: bool = False,
) -> dict:
    result = loads_json_object(content, log_label="event_batch")
    if result is None:
        return {**_error_response("Invalid JSON in response"), "best_market_id": ""}

    raw_best = str(result.get("best_market_id") or "").strip()
    best_norm = normalize_market_id(raw_best).upper()
    if best_norm and best_norm in allowed_ids:
        best_out = best_norm
    elif allowed_ids:
        best_out = sorted(allowed_ids)[0]
    else:
        best_out = ""

    direction = str(result.get("direction", "SKIP") or "SKIP").strip().upper()
    if direction not in ("YES", "NO", "SKIP"):
        legacy = str(result.get("decision", "SKIP") or "SKIP").strip().upper()
        if legacy == "BUY_YES":
            direction = "YES"
        elif legacy == "BUY_NO":
            direction = "NO"
        else:
            direction = "SKIP"

    if direction in ("YES", "NO") and best_out and best_out not in allowed_ids:
        direction = "SKIP"

    ai_yes = _extract_ai_probability_yes_pct(result)

    omap = _normalize_outcome_probability_pct_by_market_id(
        result.get("outcome_probability_pct_by_market_id"),
        allowed_ids=allowed_ids,
    )
    if (
        not ladder_stat_line_batch
        and omap
        and allowed_ids
        and set(omap.keys()) == allowed_ids
        and best_out
        and best_out in omap
    ):
        ssum = sum(omap.values())
        if 95 <= ssum <= 105:
            ai_yes = omap[best_out]
    elif (
        ladder_stat_line_batch
        and omap
        and best_out
        and best_out in omap
    ):
        ai_yes = omap[best_out]

    key_factors = result.get("key_factors", [])
    if not isinstance(key_factors, list):
        key_factors = []
    key_factors = [str(f) for f in key_factors[:5]]

    out = {
        "best_market_id": best_out,
        "direction": direction,
        "ai_probability_yes_pct": ai_yes,
        "reasoning": str(result.get("reasoning", "")).strip(),
        "real_time_context": str(result.get("real_time_context", "")).strip(),
        "key_factors": key_factors,
        "evidence": result.get("evidence", []) if isinstance(result.get("evidence", []), list) else [],
    }
    if omap:
        out["outcome_probability_pct_by_market_id"] = omap
    if ladder_stat_line_batch:
        out = _prioritize_line_ladder_likelihood(out, allowed_ids=allowed_ids)
    return out


def _parse_json(content: str) -> dict:
    """Extract and validate JSON from model response."""
    result = loads_json_object(content, log_label="market")
    if result is None:
        return _error_response("No JSON in response")

    direction = str(result.get("direction", "SKIP") or "SKIP").strip().upper()
    if direction not in ("YES", "NO", "SKIP"):
        # Back-compat: older schema used BUY_YES/BUY_NO/SKIP.
        legacy = str(result.get("decision", "SKIP") or "SKIP").strip().upper()
        if legacy == "BUY_YES":
            direction = "YES"
        elif legacy == "BUY_NO":
            direction = "NO"
        else:
            direction = "SKIP"

    ai_yes = _extract_ai_probability_yes_pct(result)

    key_factors = result.get("key_factors", [])
    if not isinstance(key_factors, list):
        key_factors = []
    key_factors = [str(f) for f in key_factors[:5]]

    return {
        "direction": direction,
        "ai_probability_yes_pct": ai_yes,
        "reasoning": str(result.get("reasoning", "")).strip(),
        "real_time_context": str(result.get("real_time_context", "")).strip(),
        "key_factors": key_factors,
        "evidence": result.get("evidence", []) if isinstance(result.get("evidence", []), list) else [],
    }


def _error_response(message: str) -> dict:
    return {
        "direction": "SKIP",
        "ai_probability_yes_pct": 50,
        "reasoning": f"Analysis unavailable: {message}",
        "real_time_context": "",
        "key_factors": [],
        "evidence": [],
        "error": message,
    }
