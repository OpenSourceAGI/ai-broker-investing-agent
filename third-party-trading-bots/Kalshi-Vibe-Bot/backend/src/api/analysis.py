import json
import uuid
from datetime import timedelta

from src.util.datetimes import utc_iso_z, utc_now
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from src.api.broadcast import broadcast_update
from src.app_state import app_state
from src.config import settings
from src.database.models import DecisionLog, get_db, get_paper_cash_balance, get_vault_balance
from src.logger import logger
from src.analysis_payload import enrich_analysis_ai_provider
from src.reconcile.open_positions import normalize_market_id

router = APIRouter(tags=["analysis"])

_LEGACY_ANALYSIS_KEYS = frozenset({"local_score", "risk_level", "target_price"})


def decision_log_lookup_sql_ids(market_ids: List[str]) -> List[str]:
    """Uppercase SQLite ``IN`` targets for ``DecisionLog.market_id``.

    Includes a legacy ``KXX…`` alias when the canonical normalized id is ``KX…`` (logs once used raw API ids).
    """
    seen: set[str] = set()
    out: List[str] = []
    for raw in market_ids:
        n = (normalize_market_id(raw) or "").strip().upper()
        if not n:
            continue
        if n not in seen:
            seen.add(n)
            out.append(n)
        if n.startswith("KX") and not n.startswith("KXX") and len(n) >= 4:
            legacy = ("KXX" + n[2:]).upper()
            if legacy not in seen:
                seen.add(legacy)
                out.append(legacy)
    return out


def _strip_ephemeral_analysis_fields(payload: dict) -> None:
    """Remove fields kept for old DB/UI contracts; not part of the stable analysis API."""
    for _k in _LEGACY_ANALYSIS_KEYS:
        payload.pop(_k, None)
    xa = payload.get("xai_analysis")
    if isinstance(xa, dict):
        for _k in ("risk_level", "target_price"):
            xa.pop(_k, None)


def serialize_decision_log_to_analysis(log: DecisionLog) -> dict:
    """Shape one ``DecisionLog`` like ``GET /analyses`` rows (dashboard + bundle)."""
    xai = {}
    try:
        xai = json.loads(log.xai_analysis) if log.xai_analysis else {}
    except Exception:
        pass
    key_factors = []
    try:
        key_factors = json.loads(log.key_factors) if log.key_factors else []
    except Exception:
        pass
    action_taken = None
    try:
        action_taken = json.loads(log.action_taken) if getattr(log, "action_taken", None) else None
    except Exception:
        action_taken = None
    ai_yes = getattr(log, "ai_probability_yes_pct", None)
    if ai_yes is None:
        ai_yes = int(round(max(0.0, min(1.0, float(log.confidence or 0))) * 100))
    m_impl = getattr(log, "market_implied_probability_pct", None)
    if m_impl is None:
        m_impl = 0
    kc = getattr(log, "kelly_contracts", None)
    if kc is None:
        kc = 0
    edge_pct = float(getattr(log, "edge", 0.0) or 0.0)

    row = {
        "decision_id": log.id,
        "trade_mode": getattr(log, "trade_mode", None) or settings.trading_mode,
        "market_id": log.market_id,
        "market_title": log.market_title,
        "decision": log.decision,
        "confidence": log.confidence,
        "ai_probability_yes_pct": int(ai_yes),
        "market_implied_probability_pct": int(m_impl),
        "edge_pct": edge_pct,
        "kelly_contracts": int(kc),
        "reasoning": log.reasoning,
        "real_time_context": log.real_time_context or "",
        "key_factors": key_factors,
        "yes_confidence": log.yes_confidence or 50,
        "no_confidence": log.no_confidence or 50,
        "escalated_to_xai": log.escalated_to_xai or False,
        "escalated_to_ai": bool(log.escalated_to_xai),
        "edge": edge_pct,
        "xai_analysis": xai,
        "ai_analysis": xai,
        "timestamp": utc_iso_z(log.timestamp),
    }
    if action_taken is not None:
        row["action_taken"] = action_taken

    enrich_analysis_ai_provider(row)

    sy = getattr(log, "snapshot_yes_price", None)
    sn = getattr(log, "snapshot_no_price", None)
    sv = getattr(log, "snapshot_volume", None)
    sd = getattr(log, "snapshot_expires_days", None)
    if sy is not None:
        row["yes_price"] = sy
    if sn is not None:
        row["no_price"] = sn
    if sv is not None:
        row["volume"] = sv
    if sd is not None:
        row["expires_in_days"] = sd

    ctx = getattr(log, "market_context", None)
    if ctx:
        try:
            snap = json.loads(ctx)
            if isinstance(snap, dict):
                for key_json, key_row in (
                    ("yes_price", "yes_price"),
                    ("no_price", "no_price"),
                    ("volume", "volume"),
                    ("expires_in_days", "expires_in_days"),
                ):
                    if key_row not in row and key_json in snap and snap[key_json] is not None:
                        row[key_row] = snap[key_json]
        except Exception:
            pass

    if "yes_price" not in row and log.yes_confidence is not None:
        row["yes_price"] = (log.yes_confidence or 0) / 100.0
    if "no_price" not in row and log.no_confidence is not None:
        row["no_price"] = (log.no_confidence or 0) / 100.0

    _strip_ephemeral_analysis_fields(row)
    return row


def fetch_latest_decision_logs_for_market_ids(
    db: Session, market_ids: List[str], *, trade_mode: Optional[str] = None
) -> Dict[str, DecisionLog]:
    """Latest ``DecisionLog`` per normalized ticker (for open legs outside the recent feed window)."""
    mode = (trade_mode or settings.trading_mode or "paper").strip().lower()
    if mode not in ("paper", "live"):
        mode = "paper"

    lookup_ids = decision_log_lookup_sql_ids(market_ids)
    if not lookup_ids:
        return {}

    mid_upper = func.upper(func.trim(DecisionLog.market_id))

    subq = (
        db.query(
            DecisionLog.market_id.label("mid"),
            func.max(DecisionLog.timestamp).label("ts_max"),
        )
        .filter(DecisionLog.trade_mode == mode)
        .filter(mid_upper.in_(lookup_ids))
        .group_by(DecisionLog.market_id)
    ).subquery()

    candidates = (
        db.query(DecisionLog)
        .join(
            subq,
            (DecisionLog.market_id == subq.c.mid) & (DecisionLog.timestamp == subq.c.ts_max),
        )
        .filter(DecisionLog.trade_mode == mode)
        .all()
    )

    out: Dict[str, DecisionLog] = {}
    for log in candidates:
        key = (normalize_market_id(log.market_id) or log.market_id).strip().upper()
        prev = out.get(key)
        if prev is None or str(log.id) > str(prev.id):
            out[key] = log
    return out


def fetch_decision_logs_by_ids(
    db: Session, decision_ids: List[str], *, trade_mode: Optional[str] = None
) -> Dict[str, DecisionLog]:
    """Return ``DecisionLog`` rows keyed by ``id`` (string), filtered by trade mode."""
    mode = (trade_mode or settings.trading_mode or "paper").strip().lower()
    if mode not in ("paper", "live"):
        mode = "paper"
    ids = sorted({str(i).strip() for i in decision_ids if i and str(i).strip()})
    if not ids:
        return {}
    logs = (
        db.query(DecisionLog)
        .filter(DecisionLog.trade_mode == mode, DecisionLog.id.in_(ids))
        .all()
    )
    return {str(log.id): log for log in logs}


@router.post("/analyze")
async def analyze_market(
    market_id: str,
    market_title: str,
    market_description: str,
    yes_price: float,
    no_price: float,
    volume: float,
    expires_in_days: int,
    close_time: Optional[str] = None,
    db: Session = Depends(get_db),
):
    de = app_state.decision_engine
    if de is None:
        raise HTTPException(status_code=503, detail="Decision engine not ready")
    try:
        logger.info("Manual analysis: %s", market_title)
        canon_mid = normalize_market_id(market_id)
        from src.database.models import get_paper_cash_balance, get_vault_balance

        if settings.trading_mode == "paper":
            uninvested = float(get_paper_cash_balance(db, settings.paper_starting_balance))
        else:
            uninvested = max(0.0, float(settings.paper_starting_balance))
        vault = float(get_vault_balance(db, trade_mode=settings.trading_mode))
        deployable = max(0.0, uninvested - min(vault, uninvested))

        decision = await de.analyze_market(
            market_id=market_id,
            market_title=market_title,
            market_description=market_description,
            current_prices={"yes": yes_price, "no": no_price, "local_vetting_notes": "Manual analyze"},
            volume=volume,
            expires_in_days=expires_in_days,
            close_time=close_time,
            deployable_balance=float(deployable),
        )

        sig = decision.get("decision", "SKIP")
        if sig == "SKIP":
            action_taken = {
                "status": "skipped",
                "summary": decision.get("action_summary") or "Skipped.",
            }
        else:
            action_taken = {
                "status": "no_trade",
                "summary": "Review only — no automatic buy from this screen.",
                "signal": sig,
            }
        decision["action_taken"] = action_taken
        _snap = {
            "yes_price": float(yes_price),
            "no_price": float(no_price),
            "volume": float(volume or 0.0),
            "expires_in_days": float(expires_in_days) if expires_in_days is not None else None,
        }
        decision["yes_price"] = _snap["yes_price"]
        decision["no_price"] = _snap["no_price"]
        decision["volume"] = _snap["volume"]
        decision["expires_in_days"] = _snap["expires_in_days"]

        log = DecisionLog(
            id=str(uuid.uuid4()),
            market_id=canon_mid,
            market_title=market_title,
            decision=decision.get("decision", "SKIP"),
            xai_analysis=json.dumps(decision.get("xai_analysis", {})),
            confidence=float(decision.get("confidence", 0) or 0),
            reasoning=decision.get("reasoning", ""),
            real_time_context=decision.get("real_time_context", ""),
            key_factors=json.dumps(decision.get("key_factors", [])),
            yes_confidence=int(decision.get("yes_confidence", int(yes_price * 100))),
            no_confidence=int(decision.get("no_confidence", int(no_price * 100))),
            escalated_to_xai=bool(decision.get("escalated_to_xai", True)),
            edge=float(decision.get("edge_pct", 0.0) or 0.0),
            ai_probability_yes_pct=int(decision.get("ai_probability_yes_pct", 50) or 50),
            market_implied_probability_pct=int(decision.get("market_implied_probability_pct", 0) or 0),
            kelly_contracts=int(decision.get("kelly_contracts", 0) or 0),
            action_taken=json.dumps(action_taken),
            market_context=json.dumps(_snap),
            snapshot_yes_price=_snap["yes_price"],
            snapshot_no_price=_snap["no_price"],
            snapshot_volume=_snap["volume"],
            snapshot_expires_days=_snap["expires_in_days"],
            trade_mode=settings.trading_mode,
        )
        db.add(log)
        db.commit()

        logger.info(
            "Decision: %s ai_yes=%s%% edge=%.1f for %s",
            decision.get("decision"),
            decision.get("ai_probability_yes_pct"),
            float(decision.get("edge_pct", 0) or 0),
            market_id,
        )
        decision["trade_mode"] = settings.trading_mode
        _strip_ephemeral_analysis_fields(decision)
        enrich_analysis_ai_provider(decision)
        await broadcast_update({"type": "analysis", "data": decision})
        return decision
    except Exception as e:
        logger.error("Analyze error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyses/stats")
async def get_analyses_stats(since_hours: int = 168, db: Session = Depends(get_db)):
    """Totals for dashboard metrics (not capped by the recent-feed page size)."""
    try:
        hrs = max(1, min(int(since_hours), 24 * 366))
        cutoff = utc_now() - timedelta(hours=hrs)
        base = (
            db.query(DecisionLog)
            .filter(
                DecisionLog.timestamp >= cutoff,
                DecisionLog.trade_mode == settings.trading_mode,
            )
        )
        total_analyses = base.count()
        escalated_to_ai = base.filter(DecisionLog.escalated_to_xai.is_(True)).count()
        return {
            "since_hours": hrs,
            "total_analyses": total_analyses,
            # Legacy key name (DB column ``escalated_to_xai``); count is all LLM escalations.
            "escalated_to_xai": escalated_to_ai,
            "escalated_to_ai": escalated_to_ai,
        }
    except Exception as e:
        logger.error("Analyses stats error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analyses")
async def get_analyses(limit: int = 50, db: Session = Depends(get_db)):
    try:
        logs = (
            db.query(DecisionLog)
            .filter(DecisionLog.trade_mode == settings.trading_mode)
            .order_by(DecisionLog.timestamp.desc())
            .limit(limit)
            .all()
        )
        return [serialize_decision_log_to_analysis(log) for log in logs]
    except Exception as e:
        logger.error("Analyses error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
