"""
Configuration management — loads all settings from the .env file.
"""

from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

# Single source for tuning fallbacks (SQLite NULL / missing ORM attr); keep in sync with ``Settings`` field defaults below.
DEFAULT_MIN_EDGE_TO_BUY_PCT = 5
DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT = 60
DEFAULT_STOP_LOSS_DRAWDOWN_PCT = 0.80
DEFAULT_MAX_OPEN_POSITIONS = 30
DEFAULT_AI_PROVIDER = "gemini"


class Settings(BaseSettings):
    """Application settings sourced from backend/.env."""

    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        # Older installs may still have hybrid / edge / vetting-score keys in .env; ignore them.
        extra="ignore",
    )

    # ── Kalshi API ──────────────────────────────────────────────────────────────
    kalshi_api_key: str = ""
    kalshi_private_key_path: str = str(BASE_DIR / "kalshi_private_key.pem")
    kalshi_base_url: str = "https://api.elections.kalshi.com"
    # Pause between ``GET /markets`` cursor pages (rate-limit cushion). 0 = no pause.
    kalshi_markets_page_delay_sec: float = 0.05

    # ── AI providers ─────────────────────────────────────────────────────────────
    # Default provider for market analysis: ``gemini`` or ``xai`` (Grok).
    default_ai_provider: Literal["gemini", "xai"] = DEFAULT_AI_PROVIDER
    ai_temperature: float = 0.1

    # ── xAI API ─────────────────────────────────────────────────────────────────
    xai_api_key: str = ""
    xai_model: str = "grok-3"
    # Optional UUID from xAI Console → Team → Settings (enables xAI prepaid tile on ``GET /portfolio``).
    xai_team_id: str = ""
    # Separate from ``XAI_API_KEY``: prepaid balance uses https://management-api.x.ai (see xAI Console → Management Keys).
    xai_management_api_key: str = ""

    # ── Google Gemini API ───────────────────────────────────────────────────────
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # ── Trading configuration ────────────────────────────────────────────────────
    trading_mode: Literal["paper", "live"] = "paper"
    paper_starting_balance: float = 1000.0  # starting cash for paper mode (USD)
    # Minimum edge (percentage points: AI prob for buy side minus market-implied ask %) to execute a buy.
    min_edge_to_buy_pct: int = DEFAULT_MIN_EDGE_TO_BUY_PCT
    # Minimum AI win probability (0–100) on the **purchased** side before a buy (clamped 51–99).
    min_ai_win_prob_buy_side_pct: int = DEFAULT_MIN_AI_WIN_PROB_BUY_SIDE_PCT

    # ── Bot scan configuration ───────────────────────────────────────────────────
    bot_scan_interval: int = 10              # seconds between full market scans
    # Max wall time for one ``scan_and_trade`` sweep in play mode (0 = unlimited). Prevents a hung sweep from silencing the loop forever.
    bot_loop_scan_timeout_sec: int = 1800
    # Max AI scan units (batch or single) per play sweep; 0 = no cap. When set, units are ordered by
    # highest 24h volume among member markets so liquid lines are analyzed first; remaining units wait for later sweeps.
    bot_max_scan_queue_units_per_sweep: int = 0
    bot_min_volume: float = 1500.0           # minimum 24h contract volume (tradeability scan; sports uses higher floor in code)
    # Vetting: BUY window prefers ``expected_expiration_time`` (event end); if missing or past, falls back to
    # the soonest future instant among ``vetting_horizon_time`` and contractual ``close_time`` (``BOT_MAX_HOURS``).
    bot_max_hours: int = 6
    # Kalshi ``GET /markets`` ``max_close_ts`` (contractual close); widen so listings return before vetting.
    bot_markets_fetch_max_close_hours: int = 720
    bot_max_spread: float = 0.15             # max bid/ask spread for YES or NO leg when buying (0.15 = 15¢)
    bot_min_top_size: float = 1.0            # min top-of-book size (contracts) on the side we may buy
    # After a stop-loss exit, skip new entries on that ticker for this many minutes (0 = off).
    reentry_cooldown_minutes: int = 120
    # Min gross upside (1 − native ask) on the purchased leg: scan filter + pre-buy gate (0 disables gate).
    # When > 0, scan requires at least one leg to be liquid and meet this floor (avoids LLM calls on skewed books).
    local_min_residual_payoff: float = 0.12

    # ── Exit hygiene ──────────────────────────────────────────────────────────────
    # No stop-loss or counter-trend exits until the position is this old (minutes).
    # Reduces churn from spread / micro noise right after IOC fills.
    exit_grace_minutes: float = 10.0
    # Stop-loss: exit when Est. Value has fallen this fraction vs **entry price** per contract (fees excluded). 0.80 = 80% drawdown.
    stop_loss_drawdown_pct: float = DEFAULT_STOP_LOSS_DRAWDOWN_PCT
    # When False, the bot never auto-exits for stop-loss (manual sells still allowed). Default off until enabled in Settings.
    stop_loss_selling_enabled: bool = False
    # Max simultaneous open positions (per trade mode); at or over this, market scan + AI analysis for new entries pauses.
    bot_max_open_positions: int = DEFAULT_MAX_OPEN_POSITIONS
    # Periodically ``GET /markets`` for recent closed rows missing ``kalshi_market_result`` (0 = disable).
    closed_resolution_refresh_interval_sec: int = 450
    # Max closed rows checked per refresh tick (missing-result filter only when automated).
    closed_resolution_refresh_batch: int = 25

    # ── Database ─────────────────────────────────────────────────────────────────
    database_url: str = f"sqlite:///{BASE_DIR / 'trading_bot.db'}"

    # When False, ``GET /debug/raw`` returns 404 (avoids exposing signed Kalshi requests on LAN installs).
    enable_debug_raw_kalshi: bool = False

    # ── Server ───────────────────────────────────────────────────────────────────
    port: int = 8000
    host: str = "0.0.0.0"
    # Comma-separated browser origins for CORS (dashboard). Empty = http://localhost:3000 and http://127.0.0.1:3000
    cors_origins: str = ""

    @field_validator("kalshi_private_key_path", mode="after")
    @classmethod
    def _resolve_key_path(cls, v):
        if v:
            p = Path(v)
            if not p.is_absolute():
                return str(BASE_DIR / p)
        return v

    @model_validator(mode="after")
    def _clamp_trading_and_scan_bounds(self):
        """Clamp key knobs to safe ranges."""
        self.bot_scan_interval = max(5, min(90, int(self.bot_scan_interval)))
        self.bot_loop_scan_timeout_sec = max(0, min(7200, int(self.bot_loop_scan_timeout_sec)))
        self.bot_max_scan_queue_units_per_sweep = max(0, min(500, int(self.bot_max_scan_queue_units_per_sweep)))
        self.bot_max_hours = max(1, min(30 * 24, int(self.bot_max_hours)))
        self.bot_markets_fetch_max_close_hours = max(
            int(self.bot_max_hours),
            min(8760, int(self.bot_markets_fetch_max_close_hours)),
        )
        self.bot_min_volume = max(0.0, min(5_000_000.0, float(self.bot_min_volume)))
        self.bot_max_spread = max(0.01, min(0.80, float(self.bot_max_spread)))
        self.bot_min_top_size = max(0.0, min(100_000.0, float(self.bot_min_top_size)))
        self.reentry_cooldown_minutes = max(0, min(7 * 24 * 60, int(self.reentry_cooldown_minutes)))
        self.local_min_residual_payoff = max(0.0, min(0.50, float(self.local_min_residual_payoff)))
        self.min_edge_to_buy_pct = max(0, min(95, int(self.min_edge_to_buy_pct)))
        self.min_ai_win_prob_buy_side_pct = max(51, min(99, int(self.min_ai_win_prob_buy_side_pct)))
        self.bot_max_open_positions = max(1, min(500, int(self.bot_max_open_positions)))
        self.exit_grace_minutes = max(0.0, min(1440.0, float(self.exit_grace_minutes)))
        self.stop_loss_drawdown_pct = max(0.01, min(0.90, float(self.stop_loss_drawdown_pct)))
        self.kalshi_markets_page_delay_sec = max(0.0, min(0.5, float(self.kalshi_markets_page_delay_sec)))
        iv = int(self.closed_resolution_refresh_interval_sec)
        self.closed_resolution_refresh_interval_sec = max(0, min(86400, iv))
        self.closed_resolution_refresh_batch = max(1, min(50, int(self.closed_resolution_refresh_batch)))
        prov = str(self.default_ai_provider or DEFAULT_AI_PROVIDER).strip().lower()
        self.default_ai_provider = "xai" if prov == "xai" else "gemini"
        return self


settings = Settings()
