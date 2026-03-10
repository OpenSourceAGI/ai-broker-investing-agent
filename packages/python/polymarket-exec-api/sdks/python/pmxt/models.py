"""
Data models for PMXT.

These are clean Pythonic wrappers around the auto-generated OpenAPI models.
"""

from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from dataclasses import dataclass


# Parameter types
CandleInterval = Literal["1m", "5m", "15m", "1h", "6h", "1d"]
SortOption = Literal["volume", "liquidity", "newest"]
SearchIn = Literal["title", "description", "both"]
OrderSide = Literal["buy", "sell"]
OrderType = Literal["market", "limit"]
OutcomeType = Literal["yes", "no", "up", "down"]


@dataclass
class MarketOutcome:
    """A single tradeable outcome within a market."""

    outcome_id: str
    """Outcome ID for trading operations. Use this for fetchOHLCV/fetchOrderBook/fetchTrades.
    - Polymarket: CLOB Token ID
    - Kalshi: Market Ticker
    """

    label: str
    """Human-readable label (e.g., "Trump", "Yes")"""

    price: float
    """Current price (0.0 to 1.0, representing probability)"""

    price_change_24h: Optional[float] = None
    """24-hour price change"""

    metadata: Optional[Dict[str, Any]] = None
    """Exchange-specific metadata"""

    market_id: Optional[str] = None
    """The market this outcome belongs to (set automatically)."""


@dataclass
class UnifiedMarket:
    """A unified market representation across exchanges."""

    market_id: str
    """The unique identifier for this market"""

    title: str
    """Market title"""
    
    outcomes: List[MarketOutcome]
    """All tradeable outcomes"""
    
    volume_24h: float
    """24-hour trading volume (USD)"""
    
    liquidity: float
    """Current liquidity (USD)"""
    
    url: str
    """Direct URL to the market"""
    
    description: Optional[str] = None
    """Market description"""
    
    resolution_date: Optional[datetime] = None
    """Expected resolution date"""
    
    volume: Optional[float] = None
    """Total volume (USD)"""
    
    open_interest: Optional[float] = None
    """Open interest (USD)"""
    
    image: Optional[str] = None
    """Market image URL"""
    
    category: Optional[str] = None
    """Market category"""
    
    tags: Optional[List[str]] = None
    """Market tags"""

    yes: Optional[MarketOutcome] = None
    """Convenience access to the Yes outcome for binary markets."""

    no: Optional[MarketOutcome] = None
    """Convenience access to the No outcome for binary markets."""

    up: Optional[MarketOutcome] = None
    """Convenience access to the Up outcome for binary markets."""

    down: Optional[MarketOutcome] = None
    """Convenience access to the Down outcome for binary markets."""

    @property
    def question(self) -> str:
        """Alias for title."""
        return self.title


class MarketList(list):
    """A list of UnifiedMarket objects with a convenience match() method."""

    def match(
        self,
        query: str,
        search_in: Optional[List[Literal["title", "description", "category", "tags", "outcomes"]]] = None,
    ) -> "UnifiedMarket":
        """Find a single market by case-insensitive substring match.

        Args:
            query: Substring to search for.
            search_in: Fields to search in (default: ["title"]).

        Returns:
            The matching UnifiedMarket.

        Raises:
            ValueError: If zero or multiple markets match.
        """
        if search_in is None:
            search_in = ["title"]
        lower_query = query.lower()
        matches = []
        for m in self:
            for field in search_in:
                if field == "title" and m.title and lower_query in m.title.lower():
                    matches.append(m)
                    break
                if field == "description" and m.description and lower_query in m.description.lower():
                    matches.append(m)
                    break
                if field == "category" and m.category and lower_query in m.category.lower():
                    matches.append(m)
                    break
                if field == "tags" and m.tags and any(lower_query in t.lower() for t in m.tags):
                    matches.append(m)
                    break
                if field == "outcomes" and m.outcomes and any(lower_query in o.label.lower() for o in m.outcomes):
                    matches.append(m)
                    break
        if len(matches) == 0:
            raise ValueError(f"No markets matching '{query}'")
        if len(matches) > 1:
            titles_str = "\n  ".join(
                f"{i+1}. {m.title[:70]}{'...' if len(m.title) > 70 else ''}"
                for i, m in enumerate(matches)
            )
            raise ValueError(
                f"Multiple markets matching '{query}' ({len(matches)} matches):\n  {titles_str}\n\nPlease refine your search."
            )
        return matches[0]


@dataclass
class PriceCandle:
    """OHLCV price candle."""
    
    timestamp: int
    """Unix timestamp (milliseconds)"""
    
    open: float
    """Opening price (0.0 to 1.0)"""
    
    high: float
    """Highest price (0.0 to 1.0)"""
    
    low: float
    """Lowest price (0.0 to 1.0)"""
    
    close: float
    """Closing price (0.0 to 1.0)"""
    
    volume: Optional[float] = None
    """Trading volume"""


@dataclass
class UnifiedEvent:
    """A grouped collection of related markets."""
    
    id: str
    """Event ID"""
    
    title: str
    """Event title"""
    
    description: str
    """Event description"""
    
    slug: str
    """Event slug"""
    
    markets: "MarketList"
    """Related markets in this event"""
    
    url: str
    """Event URL"""
    
    image: Optional[str] = None
    """Event image URL"""
    
    category: Optional[str] = None
    """Event category"""
    
    tags: Optional[List[str]] = None
    """Event tags"""



@dataclass
class OrderLevel:
    """A single price level in the order book."""
    
    price: float
    """Price (0.0 to 1.0)"""
    
    size: float
    """Number of contracts"""


@dataclass
class OrderBook:
    """Current order book for an outcome."""
    
    bids: List[OrderLevel]
    """Bid orders (sorted high to low)"""
    
    asks: List[OrderLevel]
    """Ask orders (sorted low to high)"""
    
    timestamp: Optional[int] = None
    """Unix timestamp (milliseconds)"""


@dataclass
class ExecutionPriceResult:
    """Result of an execution price calculation."""
    
    price: float
    """The volume-weighted average price"""
    
    filled_amount: float
    """The actual amount that can be filled"""
    
    fully_filled: bool
    """Whether the full requested amount can be filled"""


@dataclass
class Trade:
    """A historical trade."""

    id: str
    """Trade ID"""

    timestamp: int
    """Unix timestamp (milliseconds)"""

    price: float
    """Trade price (0.0 to 1.0)"""

    amount: float
    """Trade amount (contracts)"""

    side: Literal["buy", "sell", "unknown"]
    """Trade side"""


@dataclass
class UserTrade(Trade):
    """A trade made by the authenticated user."""

    order_id: Optional[str] = None
    """The order that generated this fill"""


@dataclass
class PaginatedMarketsResult:
    """Result of a paginated markets fetch."""

    data: "List[UnifiedMarket]"
    """Markets in this page"""

    total: int
    """Total number of markets in the snapshot"""

    next_cursor: Optional[str] = None
    """Opaque cursor to pass to the next call, or None if this is the last page"""


@dataclass
class Order:
    """An order (open, filled, or cancelled)."""
    
    id: str
    """Order ID"""
    
    market_id: str
    """Market ID"""
    
    outcome_id: str
    """Outcome ID"""
    
    side: Literal["buy", "sell"]
    """Order side"""
    
    type: Literal["market", "limit"]
    """Order type"""
    
    amount: float
    """Order amount (contracts)"""
    
    status: str
    """Order status (pending, open, filled, cancelled, rejected)"""
    
    filled: float
    """Amount filled"""
    
    remaining: float
    """Amount remaining"""
    
    timestamp: int
    """Unix timestamp (milliseconds)"""
    
    price: Optional[float] = None
    """Limit price (for limit orders)"""
    
    fee: Optional[float] = None
    """Trading fee"""


@dataclass
class Position:
    """A current position in a market."""
    
    market_id: str
    """Market ID"""
    
    outcome_id: str
    """Outcome ID"""
    
    outcome_label: str
    """Outcome label"""
    
    size: float
    """Position size (positive for long, negative for short)"""
    
    entry_price: float
    """Average entry price"""
    
    current_price: float
    """Current market price"""
    
    unrealized_pnl: float
    """Unrealized profit/loss"""
    
    realized_pnl: Optional[float] = None
    """Realized profit/loss"""


@dataclass
class Balance:
    """Account balance."""
    
    currency: str
    """Currency (e.g., "USDC")"""
    
    total: float
    """Total balance"""
    
    available: float
    """Available for trading"""
    
    locked: float
    """Locked in open orders"""


# ----------------------------------------------------------------------------
# Filtering Types
# ----------------------------------------------------------------------------

from typing import TypedDict, Callable, Union

class MinMax(TypedDict, total=False):
    """Range filter."""
    min: float
    max: float

class DateRange(TypedDict, total=False):
    """Date range filter."""
    before: datetime
    after: datetime

class PriceFilter(TypedDict, total=False):
    """Price filter."""
    outcome: OutcomeType
    min: float
    max: float

class MarketFilterCriteria(TypedDict, total=False):
    """Criteria for filtering markets locally."""
    
    # Text search
    text: str
    search_in: List[Literal["title", "description", "category", "tags", "outcomes"]]
    
    # Numeric range filters
    volume_24h: MinMax
    volume: MinMax
    liquidity: MinMax
    open_interest: MinMax
    
    # Date filters
    resolution_date: DateRange
    
    # Category/tag filters
    category: str
    tags: List[str]
    
    # Price filters
    price: PriceFilter
    price_change_24h: PriceFilter

MarketFilterFunction = Callable[[UnifiedMarket], bool]

class EventFilterCriteria(TypedDict, total=False):
    """Criteria for filtering events locally."""
    
    # Text search
    text: str
    search_in: List[Literal["title", "description", "category", "tags"]]
    
    # Category/tag filters
    category: str
    tags: List[str]
    
    # Market metrics
    market_count: MinMax
    total_volume: MinMax

EventFilterFunction = Callable[[UnifiedEvent], bool]

