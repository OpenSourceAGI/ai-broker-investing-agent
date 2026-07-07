"""
PMXT - Unified Prediction Market API

A unified interface for interacting with multiple prediction market exchanges
(Kalshi, Polymarket) identically.

Example:
    >>> import pmxt
    >>>
    >>> # Initialize exchanges
    >>> poly = pmxt.Polymarket()
    >>> kalshi = pmxt.Kalshi()
    >>>
    >>> # Fetch markets
    >>> markets = await poly.fetch_markets(query="Trump")
    >>> print(markets[0].title)
"""

from .client import Exchange
from ._exchanges import Polymarket, Limitless, Kalshi, KalshiDemo, Probable, Baozi, Myriad
from .server_manager import ServerManager
from .models import (
    UnifiedMarket,
    UnifiedEvent,
    MarketOutcome,
    MarketList,
    PriceCandle,
    OrderBook,
    OrderLevel,
    Trade,
    UserTrade,
    PaginatedMarketsResult,
    Order,
    Position,
    Balance,
)


# Global server management functions
_default_manager = ServerManager()

def stop_server():
    """
    Stop the background PMXT sidecar server.
    """
    _default_manager.stop()

def restart_server():
    """
    Restart the background PMXT sidecar server.
    """
    _default_manager.restart()

__version__ = "2.17.1"
__all__ = [
    # Exchanges
    "Polymarket",
    "Limitless",
    "Kalshi",
    "KalshiDemo",
    "Probable",
    "Baozi",
    "Myriad",
    "Exchange",
    # Server Management
    "ServerManager",
    "stop_server",
    "restart_server",
    # Data Models
    "UnifiedMarket",
    "UnifiedEvent",
    "MarketOutcome",
    "MarketList",
    "PriceCandle",
    "OrderBook",
    "OrderLevel",
    "Trade",
    "UserTrade",
    "PaginatedMarketsResult",
    "Order",
    "Position",
    "Balance",
]
