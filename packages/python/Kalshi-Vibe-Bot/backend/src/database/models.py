"""
SQLAlchemy ORM models and database helpers.
"""

from typing import Optional

from sqlalchemy.engine import Engine
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    func,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

from src.config import (
    DEFAULT_AI_PROVIDER,
    DEFAULT_MAX_OPEN_POSITIONS,
    DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT,
    DEFAULT_MIN_EDGE_TO_BUY_PCT,
    DEFAULT_STOP_LOSS_DRAWDOWN_PCT,
    settings,
)
from src.logger import logger as app_logger
from src.util.datetimes import utc_now

Base = declarative_base()


class Trade(Base):
    __tablename__ = "trades"

    id           = Column(String, primary_key=True)
    market_id    = Column(String, nullable=False)
    market_title = Column(String, default="")
    action       = Column(String, default="buy")       # "buy" | "sell"
    side         = Column(String, nullable=False)     # "YES" | "NO"
    quantity     = Column(Integer, nullable=False)
    price        = Column(Float, nullable=False)
    total_cost   = Column(Float, nullable=False)
    realized_pnl = Column(Float, default=0.0)
    timestamp    = Column(DateTime(timezone=True), default=utc_now)
    trade_mode   = Column(String, default="paper")   # "paper" | "live"


class Position(Base):
    __tablename__ = "positions"

    id              = Column(String, primary_key=True)
    market_id       = Column(String, nullable=False)
    market_title    = Column(String, nullable=False)
    event_ticker    = Column(String, nullable=True)  # Kalshi event (xAI / conflict context); backfilled on new opens
    entry_decision_log_id = Column(String, nullable=True)  # DecisionLog.id for the gate that opened this row (entry AI)
    side            = Column(String, nullable=False)
    quantity        = Column(Integer, nullable=False)
    entry_price     = Column(Float, nullable=False)
    entry_cost      = Column(Float, nullable=False)  # open: contract notional (excl. fees); fees in fees_paid
    ask_price       = Column(Float, nullable=True)   # deprecated: use bid_price (retained for older DB rows)
    bid_price       = Column(Float, nullable=True)   # best bid on held side — liquidation mark (dashboard “Best bid”)
    estimated_price = Column(Float, nullable=True)  # Kalshi YES last trade (NO → 1−YES) — Est. Value + display unrealized only
    entry_best_bid  = Column(Float, nullable=True)  # legacy optional; older rows may have entry bid snapshot (unused for stop-loss)
    stop_loss_drawdown_pct_at_entry = Column(Float, nullable=True)  # audit: threshold snapshot at open (bot uses current settings)
    current_price   = Column(Float, nullable=False)
    unrealized_pnl  = Column(Float, default=0.0)
    realized_pnl    = Column(Float, default=0.0)
    opened_at       = Column(DateTime(timezone=True), default=utc_now)
    closed_at       = Column(DateTime(timezone=True), nullable=True)
    status          = Column(String, default="open")   # "open" | "closed"
    exit_reason     = Column(String, nullable=True)    # "stop_loss" | "take_profit" | "expiration" | "manual" | "counter_trend"
    close_time      = Column(String, nullable=True)    # ISO contractual settlement (Kalshi ``close_time``)
    expected_expiration_time = Column(String, nullable=True)  # Kalshi event/market expected end — UI "Ends"
    kalshi_market_status = Column(String, nullable=True)  # Kalshi GET /markets ``status``: active, closed, determined, finalized, …
    kalshi_market_result = Column(String, nullable=True)  # ``yes`` / ``no`` when outcome is known for the contract
    trade_mode      = Column(String, default="paper")  # "paper" | "live"
    last_recheck_at = Column(DateTime(timezone=True), nullable=True)
    awaiting_settlement = Column(Boolean, default=False)  # live: dead book — defer IOC exits until Kalshi settles
    dead_market = Column(Boolean, default=False)  # live: native bid ladder empty — UI "Dead Market"; cleared when bids return
    fees_paid       = Column(Float, default=0.0)  # live: accumulated taker+maker fees (buys + sells + settlement)
    kalshi_flat_reconcile_pending = Column(
        Boolean, default=False
    )  # live: closed row still to be aligned with next flat Kalshi portfolio delta
    kalshi_closure_finalized = Column(
        Boolean, default=True
    )  # live: false until settlement/order/flat reconcile has authoritative closure data


class KalshiReconcileCursor(Base):
    """Per-ticker Kalshi cumulative realized/fees watermark for flat-row delta reconciliation."""

    __tablename__ = "kalshi_reconcile_cursor"
    __table_args__ = (UniqueConstraint("trade_mode", "market_id_norm", name="uq_kalshi_rc_mode_market"),)

    id = Column(String, primary_key=True)
    trade_mode = Column(String, nullable=False)
    market_id_norm = Column(String, nullable=False)
    last_realized_dollars = Column(Float, nullable=False, default=0.0)
    last_fees_dollars = Column(Float, nullable=False, default=0.0)
    updated_at = Column(DateTime(timezone=True), default=utc_now)


class DecisionLog(Base):
    __tablename__ = "decision_logs"

    id                  = Column(String, primary_key=True)
    market_id           = Column(String, nullable=False)
    market_title        = Column(String, nullable=False)
    decision            = Column(String, nullable=False)   # "BUY_YES" | "BUY_NO" | "SKIP"
    xai_analysis        = Column(Text, nullable=True)
    # Legacy unused column (kept for existing SQLite rows; do not write new values).
    openrouter_analysis = Column(Text, nullable=True)
    confidence          = Column(Float, nullable=False)
    reasoning           = Column(Text, nullable=True)
    real_time_context   = Column(Text, nullable=True)
    key_factors         = Column(Text, nullable=True)      # JSON array
    yes_confidence      = Column(Integer, default=50)
    no_confidence       = Column(Integer, default=50)
    escalated_to_xai    = Column(Boolean, default=False)
    edge                = Column(Float, default=0.0)
    ai_probability_yes_pct = Column(Integer, nullable=True)
    market_implied_probability_pct = Column(Integer, nullable=True)
    kelly_contracts     = Column(Integer, nullable=True)
    filter_pass         = Column(Boolean, default=True)
    pre_filter_reason   = Column(String, nullable=True)
    action_taken        = Column(Text, nullable=True)  # JSON: outcome of analysis vs execution
    market_context      = Column(Text, nullable=True)  # JSON backup of scan snapshot
    snapshot_yes_price  = Column(Float, nullable=True)
    snapshot_no_price   = Column(Float, nullable=True)
    snapshot_volume     = Column(Float, nullable=True)
    snapshot_expires_days = Column(Float, nullable=True)
    timestamp           = Column(DateTime(timezone=True), default=utc_now)
    trade_mode          = Column(String, default="paper")  # "paper" | "live"


class EventSeriesLock(Base):
    """Once a market inside an event series is chosen for entry, lock the series to prevent contradictory sibling trades."""

    __tablename__ = "event_series_locks"
    __table_args__ = (UniqueConstraint("trade_mode", "event_ticker", name="uq_event_series_lock_mode_event"),)

    id = Column(String, primary_key=True)
    trade_mode = Column(String, nullable=False, default="paper")  # "paper" | "live"
    event_ticker = Column(String, nullable=False)  # normalized upper
    chosen_market_id = Column(String, nullable=False)  # normalized market id upper
    chosen_side = Column(String, nullable=True)  # "YES" | "NO"
    created_at = Column(DateTime(timezone=True), default=utc_now)


class PortfolioSnapshot(Base):
    __tablename__ = "portfolio_snapshots"

    id                 = Column(String, primary_key=True)
    total_balance      = Column(Float, nullable=False)
    available_balance  = Column(Float, nullable=False)
    invested_amount    = Column(Float, nullable=False)
    unrealized_pnl     = Column(Float, default=0.0)
    realized_pnl       = Column(Float, default=0.0)
    total_return_pct   = Column(Float, default=0.0)
    num_open_positions = Column(Integer, default=0)
    timestamp          = Column(DateTime(timezone=True), default=utc_now)


class Market(Base):
    __tablename__ = "markets"

    id              = Column(String, primary_key=True)
    title           = Column(String, nullable=False)
    category        = Column(String, default="")
    description     = Column(Text, nullable=True)
    yes_price       = Column(Float, nullable=False)
    no_price        = Column(Float, nullable=False)
    volume          = Column(Float, default=0.0)
    expiration_time = Column(DateTime(timezone=True), nullable=True)
    last_updated    = Column(DateTime(timezone=True), default=utc_now)


class BotState(Base):
    __tablename__ = "bot_state"

    id         = Column(Integer, primary_key=True, default=1)
    state      = Column(String, default="stop")   # "play" | "pause" | "stop"
    updated_at = Column(DateTime(timezone=True), default=utc_now)


class VaultState(Base):
    """Per-mode (paper/live) reserve that is *locked away* from new entries.

    This does not affect the broker/Kalshi cash balance; it is an internal budgeting guard
    so the bot and UI size buys using (uninvested_cash - vault_balance).
    """

    __tablename__ = "vault_state"
    __table_args__ = (UniqueConstraint("trade_mode", name="uq_vault_state_trade_mode"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_mode = Column(String, nullable=False, default="paper")  # "paper" | "live"
    vault_balance = Column(Float, default=0.0)
    updated_at = Column(DateTime(timezone=True), default=utc_now)


class TuningState(Base):
    """Per-mode (paper/live): stop-loss, minimum edge to buy, master stop-loss switch."""

    __tablename__ = "tuning_state"
    __table_args__ = (UniqueConstraint("trade_mode", name="uq_tuning_state_trade_mode"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    trade_mode = Column(String, nullable=False, default="paper")  # "paper" | "live"

    stop_loss_drawdown_pct = Column(Float, default=DEFAULT_STOP_LOSS_DRAWDOWN_PCT)
    stop_loss_selling_enabled = Column(Boolean, default=False)
    min_edge_to_buy_pct = Column(Integer, default=DEFAULT_MIN_EDGE_TO_BUY_PCT)
    min_ai_win_prob_buy_side_pct = Column(Integer, default=DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT)
    max_open_positions = Column(Integer, default=DEFAULT_MAX_OPEN_POSITIONS)
    ai_provider = Column(String, default=DEFAULT_AI_PROVIDER)  # "gemini" | "xai"

    updated_at = Column(DateTime(timezone=True), default=utc_now)


# ── Database helpers ───────────────────────────────────────────────────────────

_engine: Optional[Engine] = None
_session_factory = None


def _sqlite_on_connect(dbapi_conn, _connection_record) -> None:
    """WAL + busy wait on each new SQLite connection (pool-safe)."""
    cur = dbapi_conn.cursor()
    try:
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=60000")
    finally:
        cur.close()


def get_engine() -> Engine:
    """Singleton engine — avoids creating a new pool on every request/session."""
    global _engine
    if _engine is None:
        url = (settings.database_url or "").strip()
        connect_args: dict = {"check_same_thread": False}
        if url.lower().startswith("sqlite"):
            # Longer busy timeout reduces "database is locked" under concurrent bot + API polling.
            connect_args["timeout"] = 60.0
        _engine = create_engine(
            url,
            connect_args=connect_args,
            pool_pre_ping=True,
            # Default pool (5 + 10 overflow) is easy to exhaust when async handlers await
            # slow HTTP while holding a request-scoped Session. UI polling + bot loop can overlap.
            pool_size=15,
            max_overflow=25,
            pool_timeout=45.0,
        )
        if url.lower().startswith("sqlite"):
            event.listen(_engine, "connect", _sqlite_on_connect)
    return _engine


def get_session_local():
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _session_factory


def _ensure_sqlite_indexes(engine: Engine) -> None:
    """Idempotent indexes for hot filters (positions monitor, analyses)."""
    stmts = (
        # Recent closes / tuning queries (trade_mode, status, closed_at ORDER BY DESC)
        """
        CREATE INDEX IF NOT EXISTS ix_positions_trade_status_closed_at
        ON positions (trade_mode, status, closed_at)
        """,
        # Open-book scans / dedupe ordering
        """
        CREATE INDEX IF NOT EXISTS ix_positions_trade_open_opened
        ON positions (trade_mode, status, opened_at)
        WHERE status = 'open'
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_decision_logs_mode_timestamp
        ON decision_logs (trade_mode, timestamp)
        """,
        # Scan cooldown: escalated xAI rows by time window
        """
        CREATE INDEX IF NOT EXISTS ix_decision_logs_xai_timestamp
        ON decision_logs (timestamp)
        WHERE escalated_to_xai = 1
        """,
        """
        CREATE INDEX IF NOT EXISTS ix_trades_mode_timestamp
        ON trades (trade_mode, timestamp)
        """,
        # Live closed rows awaiting Kalshi closure finalization (reconcile hot path)
        """
        CREATE INDEX IF NOT EXISTS ix_positions_live_closed_unfinalized
        ON positions (trade_mode, closed_at)
        WHERE status = 'closed'
          AND trade_mode = 'live'
          AND kalshi_closure_finalized = 0
        """,
    )
    with engine.connect() as conn:
        for stmt in stmts:
            conn.execute(text(stmt))
        conn.commit()


def init_db():
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    _run_migrations(engine)
    if (settings.database_url or "").strip().lower().startswith("sqlite"):
        _ensure_sqlite_indexes(engine)
    SessionLocal = get_session_local()
    db = SessionLocal()
    try:
        from src.reconcile.open_positions import dedupe_open_positions, ensure_open_position_unique_index

        for mode in ("paper", "live"):
            dedupe_open_positions(db, mode)
        ensure_open_position_unique_index(engine)
        _ensure_tuning_rows_per_mode(db)
        _ensure_vault_rows_per_mode(db)
        app_logger.info("Database initialized: %s", settings.database_url)
    finally:
        db.close()


def _ensure_kalshi_reconcile_cursor_table(conn) -> None:
    """Create Kalshi reconcile cursor table if missing (SQLite)."""
    try:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS kalshi_reconcile_cursor (
                    id TEXT PRIMARY KEY,
                    trade_mode TEXT NOT NULL,
                    market_id_norm TEXT NOT NULL,
                    last_realized_dollars REAL NOT NULL DEFAULT 0,
                    last_fees_dollars REAL NOT NULL DEFAULT 0,
                    updated_at DATETIME,
                    UNIQUE (trade_mode, market_id_norm)
                )
                """
            )
        )
        conn.commit()
    except Exception:
        conn.rollback()


def _prune_legacy_schema(conn) -> None:
    """Drop auto-tuner / hybrid-era tables and columns (idempotent)."""
    patch_id = "prune_legacy_schema_v3"

    def _try(sql: str) -> None:
        try:
            conn.execute(text(sql))
            conn.commit()
        except Exception:
            conn.rollback()

    try:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS _bot_patches (
                    id TEXT PRIMARY KEY
                )
                """
            )
        )
        conn.commit()
    except Exception:
        conn.rollback()
        return

    try:
        if conn.execute(
            text("SELECT 1 FROM _bot_patches WHERE id = :id"),
            {"id": patch_id},
        ).fetchone():
            return
    except Exception:
        conn.rollback()
        return

    _try("DROP TABLE IF EXISTS tuning_history")
    _try("DROP INDEX IF EXISTS ix_positions_cohort_side_closed_at")

    for table, col in (
        ("tuning_state", "max_trade_pct"),
        ("tuning_state", "override_max_trade_pct"),
        ("tuning_state", "override_stop_loss_drawdown_pct"),
        ("tuning_state", "auto_tune_trade_knobs"),
        ("tuning_state", "last_tune_closed_position_count"),
        ("tuning_state", "last_tune_sell_trade_count"),
        ("tuning_state", "override_max_daily_loss_pct"),
        ("tuning_state", "max_daily_loss_pct"),
        ("tuning_state", "override_max_positions"),
        ("tuning_state", "max_positions"),
        ("tuning_state", "override_counter_trend_abs_floor"),
        ("tuning_state", "counter_trend_abs_floor"),
        ("tuning_state", "override_bot_scan_interval"),
        ("tuning_state", "bot_scan_interval"),
        ("tuning_state", "override_local_vetting_threshold"),
        ("tuning_state", "override_min_edge_to_trade"),
        ("tuning_state", "override_min_confidence_to_trade"),
        ("tuning_state", "local_vetting_threshold"),
        ("tuning_state", "min_edge_to_trade"),
        ("tuning_state", "min_confidence_to_trade"),
        ("tuning_state", "override_max_position_size_pct"),
        ("tuning_state", "max_position_size_pct"),
        ("positions", "cohort_tag"),
        ("decision_logs", "local_score"),
    ):
        _try(f"ALTER TABLE {table} DROP COLUMN {col}")

    try:
        conn.execute(text("INSERT INTO _bot_patches (id) VALUES (:id)"), {"id": patch_id})
        conn.commit()
    except Exception:
        conn.rollback()


def _run_migrations(engine):
    """Add new columns to existing tables idempotently (SQLite ALTER TABLE)."""
    migrations = [
        # table, column, sql_type_default
        ("tuning_state", "stop_loss_drawdown_pct",  f"FLOAT DEFAULT {DEFAULT_STOP_LOSS_DRAWDOWN_PCT}"),
        ("tuning_state", "stop_loss_selling_enabled", "BOOLEAN DEFAULT 0"),
        ("tuning_state", "updated_at",               "DATETIME"),
        ("trades",        "action",            "TEXT DEFAULT 'buy'"),
        ("decision_logs", "yes_confidence",    "INTEGER DEFAULT 50"),
        ("decision_logs", "no_confidence",     "INTEGER DEFAULT 50"),
        ("decision_logs", "real_time_context", "TEXT"),
        ("decision_logs", "key_factors",       "TEXT"),
        ("decision_logs", "escalated_to_xai",  "BOOLEAN DEFAULT 0"),
        ("decision_logs", "edge",              "FLOAT DEFAULT 0.0"),
        ("decision_logs", "action_taken",      "TEXT"),
        ("decision_logs", "market_context",    "TEXT"),
        ("decision_logs", "snapshot_yes_price",   "FLOAT"),
        ("decision_logs", "snapshot_no_price",    "FLOAT"),
        ("decision_logs", "snapshot_volume",      "FLOAT"),
        ("decision_logs", "snapshot_expires_days", "FLOAT"),
        ("decision_logs", "trade_mode", "TEXT DEFAULT 'paper'"),
        ("positions",     "last_recheck_at",   "DATETIME"),
        ("positions",     "ask_price",         "FLOAT"),
        ("positions", "awaiting_settlement", "BOOLEAN DEFAULT 0"),
        ("positions", "fees_paid", "FLOAT DEFAULT 0"),
        ("positions", "kalshi_flat_reconcile_pending", "BOOLEAN DEFAULT 0"),
        ("positions", "kalshi_closure_finalized", "BOOLEAN DEFAULT 1"),
        ("positions", "dead_market", "BOOLEAN DEFAULT 0"),
        ("positions", "bid_price", "FLOAT"),
        ("positions", "entry_best_bid", "FLOAT"),
        ("positions", "stop_loss_drawdown_pct_at_entry", "FLOAT"),
        ("positions", "estimated_price", "FLOAT"),
        ("positions", "kalshi_market_status", "TEXT"),
        ("positions", "kalshi_market_result", "TEXT"),
        ("positions", "expected_expiration_time", "TEXT"),
        ("positions", "event_ticker", "TEXT"),
        ("positions", "entry_decision_log_id", "TEXT"),
        ("tuning_state", "min_edge_to_buy_pct", f"INTEGER DEFAULT {DEFAULT_MIN_EDGE_TO_BUY_PCT}"),
        ("tuning_state", "min_ai_win_prob_buy_side_pct", f"INTEGER DEFAULT {DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT}"),
        ("tuning_state", "max_open_positions", f"INTEGER DEFAULT {DEFAULT_MAX_OPEN_POSITIONS}"),
        ("tuning_state", "ai_provider", f"TEXT DEFAULT '{DEFAULT_AI_PROVIDER}'"),
        ("decision_logs", "ai_probability_yes_pct", "INTEGER"),
        ("decision_logs", "market_implied_probability_pct", "INTEGER"),
        ("decision_logs", "kelly_contracts", "INTEGER"),
    ]
    with engine.connect() as conn:
        _ensure_kalshi_reconcile_cursor_table(conn)
        _prune_legacy_schema(conn)

        for table, column, typedef in migrations:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {typedef}"))
                conn.commit()
            except Exception:
                pass  # Column already exists — safe to ignore


def get_db():
    SessionLocal = get_session_local()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_tuning_rows_per_mode(db) -> None:
    """Ensure paper and live tuning rows exist (idempotent). Used after migrations."""
    for mode in ("paper", "live"):
        existing = db.query(TuningState).filter(TuningState.trade_mode == mode).first()
        if existing:
            continue
        row = TuningState(
            trade_mode=mode,
            stop_loss_drawdown_pct=float(settings.stop_loss_drawdown_pct),
            stop_loss_selling_enabled=bool(settings.stop_loss_selling_enabled),
            min_edge_to_buy_pct=int(settings.min_edge_to_buy_pct),
            min_ai_win_prob_buy_side_pct=int(settings.min_ai_win_prob_buy_side_pct),
            max_open_positions=int(settings.bot_max_open_positions),
            ai_provider=str(settings.default_ai_provider),
        )
        db.add(row)
    db.commit()


def _ensure_vault_rows_per_mode(db) -> None:
    """Ensure paper and live vault rows exist (idempotent). Used after migrations."""
    for mode in ("paper", "live"):
        existing = db.query(VaultState).filter(VaultState.trade_mode == mode).first()
        if existing:
            continue
        db.add(VaultState(trade_mode=mode, vault_balance=0.0))
    db.commit()


def get_paper_cash_balance(db, starting_balance: float) -> float:
    """Compute paper cash from trade history.

    We treat Trade.total_cost as:
    - buy: cash outflow
    - sell: cash inflow (proceeds)
    """
    buy_outflow = (
        db.query(func.coalesce(func.sum(Trade.total_cost), 0.0))
        .filter(Trade.trade_mode == "paper", Trade.action == "buy")
        .scalar()
    )
    sell_inflow = (
        db.query(func.coalesce(func.sum(Trade.total_cost), 0.0))
        .filter(Trade.trade_mode == "paper", Trade.action == "sell")
        .scalar()
    )
    return float(starting_balance + float(sell_inflow or 0.0) - float(buy_outflow or 0.0))


def ensure_tuning_state(db, trade_mode: Optional[str] = None) -> TuningState:
    mode = trade_mode or settings.trading_mode
    if mode not in ("paper", "live"):
        mode = "paper"
    row = db.query(TuningState).filter(TuningState.trade_mode == mode).first()
    if not row:
        row = TuningState(
            trade_mode=mode,
            stop_loss_drawdown_pct=float(settings.stop_loss_drawdown_pct),
            stop_loss_selling_enabled=bool(settings.stop_loss_selling_enabled),
            min_edge_to_buy_pct=int(settings.min_edge_to_buy_pct),
            min_ai_win_prob_buy_side_pct=int(settings.min_ai_win_prob_buy_side_pct),
            max_open_positions=int(settings.bot_max_open_positions),
            ai_provider=str(settings.default_ai_provider),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def ensure_vault_state(db, trade_mode: Optional[str] = None) -> VaultState:
    mode = trade_mode or settings.trading_mode
    if mode not in ("paper", "live"):
        mode = "paper"
    row = db.query(VaultState).filter(VaultState.trade_mode == mode).first()
    if not row:
        row = VaultState(trade_mode=mode, vault_balance=0.0)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_vault_balance(db, trade_mode: Optional[str] = None) -> float:
    row = ensure_vault_state(db, trade_mode=trade_mode)
    try:
        v = float(row.vault_balance or 0.0)
    except Exception:
        v = 0.0
    return max(0.0, v)
