"""
Logging setup: console + rotating file + in-memory buffer for WebSocket streaming.
"""

import asyncio
import logging
import sys
import time
from collections import deque
from datetime import datetime
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Any, Callable, Coroutine, Optional

# ── in-memory ring buffer (last 500 entries) ────────────────────────────────
MAX_LOG_BUFFER = 500
log_buffer: deque = deque(maxlen=MAX_LOG_BUFFER)

# WebSocket log streaming: cap bursts so scan-heavy ticks don't schedule hundreds of tasks/sec.
_LOG_WS_TIMESTAMPS: deque = deque(maxlen=40)
_LOG_WS_MAX_PER_SEC = 25

# optional async callback set by main.py once the WebSocket layer is ready
_broadcast_callback: Optional[Callable[[dict], Coroutine[Any, Any, None]]] = None


def set_broadcast_callback(callback: Callable[[dict], Coroutine[Any, Any, None]]) -> None:
    global _broadcast_callback
    _broadcast_callback = callback


class _BufferAndBroadcastHandler(logging.Handler):
    """Appends every record to log_buffer and broadcasts it over WebSocket."""

    def emit(self, record: logging.LogRecord) -> None:
        entry = {
            "timestamp": datetime.fromtimestamp(record.created).strftime(
                "%Y-%m-%d %H:%M:%S"
            ),
            "level": record.levelname,
            "name": record.name,
            "message": self.format(record),
        }
        log_buffer.append(entry)

        if _broadcast_callback is not None:
            now = time.monotonic()
            while _LOG_WS_TIMESTAMPS and now - _LOG_WS_TIMESTAMPS[0] > 1.0:
                _LOG_WS_TIMESTAMPS.popleft()
            if len(_LOG_WS_TIMESTAMPS) >= _LOG_WS_MAX_PER_SEC:
                return
            _LOG_WS_TIMESTAMPS.append(now)
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(
                        _broadcast_callback({"type": "log", "data": entry})
                    )
            except RuntimeError:
                pass


class _SafeTimedRotatingFileHandler(TimedRotatingFileHandler):
    """TimedRotatingFileHandler that won't crash on Windows file-lock rollover.

    When another process has the log file open (common on Windows), rollover can raise
    PermissionError. In that case, we skip rollover and continue writing to the current file.
    """

    def doRollover(self) -> None:
        try:
            super().doRollover()
        except PermissionError:
            # Best-effort: keep logging without rotation.
            try:
                if self.stream:
                    self.stream.flush()
            except Exception:
                pass
        except OSError as e:
            # Handle other Windows sharing violations similarly.
            if getattr(e, "winerror", None) == 32:
                try:
                    if self.stream:
                        self.stream.flush()
                except Exception:
                    pass
                return
            raise


def setup_logging(name: str = "kalshi_bot", level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(level)

    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        "[%(asctime)s] %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)

    # Rotating file — one file per day, keep 7 days
    log_dir = Path(__file__).resolve().parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    file_handler = _SafeTimedRotatingFileHandler(
        log_dir / "kalshi_bot.log",
        when="midnight",
        backupCount=7,
        encoding="utf-8",
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(formatter)

    # Buffer + broadcast
    buffer_handler = _BufferAndBroadcastHandler()
    buffer_handler.setLevel(level)
    buffer_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    logger.addHandler(buffer_handler)

    return logger


logger = setup_logging()
