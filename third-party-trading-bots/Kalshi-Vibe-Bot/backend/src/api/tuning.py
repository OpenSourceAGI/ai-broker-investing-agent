from __future__ import annotations

"""REST tuning endpoints: stop-loss, minimum edge, and runtime sync for the bot."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.api.broadcast import broadcast_update
from src.ai_provider import normalize_ai_provider
from src.api.schemas import AiProviderRequest, StopLossSellingRequest, StrategyKnobsRequest
from src.app_state import app_state
from src.config import (
    DEFAULT_AI_PROVIDER,
    DEFAULT_MAX_OPEN_POSITIONS,
    DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT,
    DEFAULT_MIN_EDGE_TO_BUY_PCT,
    Settings,
    settings as app_settings,
)
from src.database.models import ensure_tuning_state, get_db
from src.util.datetimes import utc_iso_z, utc_now

router = APIRouter(tags=["tuning"])

_STRATEGY_FIELD_BOUNDS: dict[str, tuple[float, float]] = {
    "stop_loss_drawdown_pct": (0.05, 0.90),
    "min_edge_to_buy_pct": (0.0, 95.0),
}


def _clamp(field: str, raw: float) -> float:
    lo, hi = _STRATEGY_FIELD_BOUNDS[field]
    return max(lo, min(hi, float(raw)))


def _coalesce_int(row, attr: str, default: int) -> int:
    v = getattr(row, attr, None)
    return default if v is None else int(v)


def _coalesce_ai_provider(row) -> str:
    raw = getattr(row, "ai_provider", None)
    if raw is not None and str(raw).strip():
        return normalize_ai_provider(raw)
    return normalize_ai_provider(getattr(app_settings, "default_ai_provider", DEFAULT_AI_PROVIDER))


def tuning_state_payload(row) -> dict:
    return {
        "stop_loss_drawdown_pct": round(
            float(getattr(row, "stop_loss_drawdown_pct", app_settings.stop_loss_drawdown_pct)),
            4,
        ),
        "min_edge_to_buy_pct": _coalesce_int(row, "min_edge_to_buy_pct", DEFAULT_MIN_EDGE_TO_BUY_PCT),
        "stop_loss_selling_enabled": bool(getattr(row, "stop_loss_selling_enabled", False)),
        "min_ai_win_prob_buy_side_pct": _coalesce_int(
            row, "min_ai_win_prob_buy_side_pct", DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT
        ),
        "max_open_positions": _coalesce_int(row, "max_open_positions", DEFAULT_MAX_OPEN_POSITIONS),
        "ai_provider": _coalesce_ai_provider(row),
        "gemini_model": str(getattr(app_settings, "gemini_model", "gemini-2.5-flash")),
        "xai_model": str(getattr(app_settings, "xai_model", "grok-3")),
        "updated_at": utc_iso_z(row.updated_at),
    }


def sync_runtime_from_db(db: Session) -> None:
    """Align in-memory ``settings`` with persisted tuning row (portfolio polls pick up UI changes immediately)."""
    row = ensure_tuning_state(db)
    _sync_runtime_from_row(row)


def _sync_runtime_from_row(row) -> None:
    app_settings.stop_loss_drawdown_pct = float(
        getattr(row, "stop_loss_drawdown_pct", app_settings.stop_loss_drawdown_pct)
    )
    app_settings.min_edge_to_buy_pct = _coalesce_int(row, "min_edge_to_buy_pct", DEFAULT_MIN_EDGE_TO_BUY_PCT)
    app_settings.stop_loss_selling_enabled = bool(
        getattr(row, "stop_loss_selling_enabled", getattr(app_settings, "stop_loss_selling_enabled", False))
    )
    app_settings.min_ai_win_prob_buy_side_pct = _coalesce_int(
        row, "min_ai_win_prob_buy_side_pct", DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT
    )
    app_settings.bot_max_open_positions = _coalesce_int(
        row, "max_open_positions", DEFAULT_MAX_OPEN_POSITIONS
    )
    prov = _coalesce_ai_provider(row)
    app_settings.default_ai_provider = prov
    de = app_state.decision_engine
    if de is not None:
        de.set_ai_provider(prov)


def apply_config_defaults_to_tuning_state(db: Session) -> dict:
    fresh = Settings()
    row = ensure_tuning_state(db)

    row.stop_loss_drawdown_pct = float(fresh.stop_loss_drawdown_pct)
    row.min_edge_to_buy_pct = int(fresh.min_edge_to_buy_pct)
    row.stop_loss_selling_enabled = bool(fresh.stop_loss_selling_enabled)
    row.min_ai_win_prob_buy_side_pct = int(fresh.min_ai_win_prob_buy_side_pct)
    row.max_open_positions = int(fresh.bot_max_open_positions)
    row.ai_provider = normalize_ai_provider(fresh.default_ai_provider)

    row.updated_at = utc_now()
    db.add(row)
    db.commit()

    _sync_runtime_from_row(row)
    return tuning_state_payload(row)


@router.get("/tuning/state")
async def get_tuning_state(db: Session = Depends(get_db)):
    row = ensure_tuning_state(db)
    _sync_runtime_from_row(row)
    return tuning_state_payload(row)


@router.post("/tuning/strategy-knobs")
async def set_strategy_knobs(req: StrategyKnobsRequest, db: Session = Depends(get_db)):
    """Persist minimum edge, stop-loss drawdown, and/or AI buy-side win-prob floor; bot uses values after commit."""
    row = ensure_tuning_state(db)
    if req.min_edge_to_buy_pct is not None:
        row.min_edge_to_buy_pct = int(_clamp("min_edge_to_buy_pct", float(req.min_edge_to_buy_pct)))
    if req.stop_loss_drawdown_pct is not None:
        row.stop_loss_drawdown_pct = _clamp("stop_loss_drawdown_pct", float(req.stop_loss_drawdown_pct))
    if req.min_ai_win_prob_buy_side_pct is not None:
        v = int(req.min_ai_win_prob_buy_side_pct)
        # Floor 51 = strictly above 50% on the buy side; cap 99 matches ``config.py`` validator.
        row.min_ai_win_prob_buy_side_pct = max(51, min(99, v))
    if req.max_open_positions is not None:
        row.max_open_positions = max(1, min(500, int(req.max_open_positions)))
    row.updated_at = utc_now()
    db.add(row)
    db.commit()
    _sync_runtime_from_row(row)
    payload = tuning_state_payload(row)
    await broadcast_update({"type": "tuning_update", "data": payload})
    return payload


def _require_api_key_for_provider(provider: str) -> None:
    prov = normalize_ai_provider(provider)
    if prov == "xai" and not (getattr(app_settings, "xai_api_key", None) or "").strip():
        raise HTTPException(
            status_code=400,
            detail="XAI_API_KEY is not set in backend/.env — required when using xAI (Grok).",
        )
    if prov == "gemini" and not (getattr(app_settings, "gemini_api_key", None) or "").strip():
        raise HTTPException(
            status_code=400,
            detail="GEMINI_API_KEY is not set in backend/.env — required when using Gemini.",
        )


@router.post("/tuning/ai-provider")
async def set_ai_provider(req: AiProviderRequest, db: Session = Depends(get_db)):
    """Switch market-analysis provider (Gemini vs xAI); bot uses the new provider immediately."""
    _require_api_key_for_provider(req.provider)
    row = ensure_tuning_state(db)
    row.ai_provider = normalize_ai_provider(req.provider)
    row.updated_at = utc_now()
    db.add(row)
    db.commit()
    _sync_runtime_from_row(row)
    payload = tuning_state_payload(row)
    await broadcast_update({"type": "tuning_update", "data": payload})
    return payload


@router.post("/tuning/stop-loss-selling")
async def set_stop_loss_selling(req: StopLossSellingRequest, db: Session = Depends(get_db)):
    """Enable or disable automatic stop-loss exits (manual sells unaffected)."""
    row = ensure_tuning_state(db)
    row.stop_loss_selling_enabled = bool(req.enabled)
    row.updated_at = utc_now()
    db.add(row)
    db.commit()
    _sync_runtime_from_row(row)
    payload = tuning_state_payload(row)
    await broadcast_update({"type": "tuning_update", "data": payload})
    return payload


@router.post("/tuning/reset-to-config-defaults")
async def reset_tuning_to_config_defaults(db: Session = Depends(get_db)):
    payload = apply_config_defaults_to_tuning_state(db)
    await broadcast_update({"type": "tuning_update", "data": payload})
    return payload
