"""
Process-wide references set during FastAPI lifespan (avoids circular imports with route modules).
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, List, Optional

from fastapi import WebSocket


@dataclass
class AppState:
    connected_clients: List[WebSocket] = field(default_factory=list)
    decision_engine: Optional[Any] = None
    kalshi_client: Optional[Any] = None
    bot_loop_task: Optional[asyncio.Task] = None
    # Dashboard: market scan + AI analysis eligibility (updated from bot loop and GET /portfolio).
    order_search_active: bool = False
    order_search_label: str = "Starting…"
    # Serialize UI-triggered Kalshi portfolio pulls (``/portfolio`` + ``/positions`` in parallel
    # would duplicate slow HTTP + SQLite work and block the dashboard for minutes).
    _kalshi_ui_reconcile_lock: Optional[asyncio.Lock] = field(default=None, repr=False)
    _kalshi_open_marks_refresh_lock: Optional[asyncio.Lock] = field(default=None, repr=False)


app_state = AppState()


def kalshi_open_marks_refresh_lock() -> asyncio.Lock:
    """Only one open-position mark refresh at a time (``GET /portfolio`` vs ``/positions`` in parallel)."""
    if app_state._kalshi_open_marks_refresh_lock is None:
        app_state._kalshi_open_marks_refresh_lock = asyncio.Lock()
    return app_state._kalshi_open_marks_refresh_lock


def kalshi_ui_reconcile_lock() -> asyncio.Lock:
    """Lazy-init lock (must be used from async FastAPI handlers only)."""
    if app_state._kalshi_ui_reconcile_lock is None:
        app_state._kalshi_ui_reconcile_lock = asyncio.Lock()
    return app_state._kalshi_ui_reconcile_lock
