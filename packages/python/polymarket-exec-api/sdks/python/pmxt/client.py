"""
Exchange client implementations.

This module provides clean, Pythonic wrappers around the auto-generated
OpenAPI client, matching the JavaScript API exactly.
"""

import os
import sys
from typing import List, Optional, Dict, Any, Literal, Union
from datetime import datetime
from abc import ABC, abstractmethod
import json

# Add generated client to path
_GENERATED_PATH = os.path.join(os.path.dirname(__file__), "..", "generated")
if _GENERATED_PATH not in sys.path:
    sys.path.insert(0, _GENERATED_PATH)

from pmxt_internal import ApiClient, Configuration
from pmxt_internal.api.default_api import DefaultApi
from pmxt_internal.exceptions import ApiException
from pmxt_internal import models as internal_models

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
    ExecutionPriceResult,
    MarketFilterCriteria,
    MarketFilterFunction,
    EventFilterCriteria,
    EventFilterFunction,
)
from .server_manager import ServerManager


def _convert_outcome(raw: Dict[str, Any]) -> MarketOutcome:
    """Convert raw API response to MarketOutcome."""
    return MarketOutcome(
        outcome_id=raw.get("outcomeId"),
        label=raw.get("label"),
        price=raw.get("price"),
        price_change_24h=raw.get("priceChange24h"),
        metadata=raw.get("metadata"),
        market_id=raw.get("marketId"),
    )


def _convert_market(raw: Dict[str, Any]) -> UnifiedMarket:
    """Convert raw API response to UnifiedMarket."""
    outcomes = [_convert_outcome(o) for o in raw.get("outcomes", [])]
    
    # Handle resolution date (could be str or datetime)
    res_date_raw = raw.get("resolutionDate")
    res_date = None
    
    if res_date_raw:
        if isinstance(res_date_raw, str):
            try:
                res_date = datetime.fromisoformat(res_date_raw.replace("Z", "+00:00"))
            except ValueError:
                pass # Keep as None if parsing fails
        elif isinstance(res_date_raw, datetime):
            res_date = res_date_raw

    return UnifiedMarket(
        market_id=raw.get("marketId"),
        title=raw.get("title"),
        outcomes=outcomes,
        volume_24h=raw.get("volume24h", 0),
        liquidity=raw.get("liquidity", 0),
        url=raw.get("url"),
        description=raw.get("description"),
        resolution_date=res_date,
        volume=raw.get("volume"),
        open_interest=raw.get("openInterest"),
        image=raw.get("image"),
        category=raw.get("category"),
        tags=raw.get("tags"),
        yes=_convert_outcome(raw["yes"]) if raw.get("yes") else None,
        no=_convert_outcome(raw["no"]) if raw.get("no") else None,
        up=_convert_outcome(raw["up"]) if raw.get("up") else None,
        down=_convert_outcome(raw["down"]) if raw.get("down") else None,
    )


def _convert_event(raw: Dict[str, Any]) -> UnifiedEvent:
    """Convert raw API response to UnifiedEvent."""
    markets = MarketList(_convert_market(m) for m in raw.get("markets", []))

    return UnifiedEvent(
        id=raw.get("id"),
        title=raw.get("title"),
        description=raw.get("description"),
        slug=raw.get("slug"),
        markets=markets,
        url=raw.get("url"),
        image=raw.get("image"),
        category=raw.get("category"),
        tags=raw.get("tags"),
    )


def _convert_candle(raw: Dict[str, Any]) -> PriceCandle:
    """Convert raw API response to PriceCandle."""
    return PriceCandle(
        timestamp=raw.get("timestamp"),
        open=raw.get("open"),
        high=raw.get("high"),
        low=raw.get("low"),
        close=raw.get("close"),
        volume=raw.get("volume"),
    )


def _convert_order_book(raw: Dict[str, Any]) -> OrderBook:
    """Convert raw API response to OrderBook."""
    bids = [OrderLevel(price=b.get("price"), size=b.get("size")) for b in raw.get("bids", [])]
    asks = [OrderLevel(price=a.get("price"), size=a.get("size")) for a in raw.get("asks", [])]
    
    return OrderBook(
        bids=bids,
        asks=asks,
        timestamp=raw.get("timestamp"),
    )


def _convert_trade(raw: Dict[str, Any]) -> Trade:
    """Convert raw API response to Trade."""
    return Trade(
        id=raw.get("id"),
        timestamp=raw.get("timestamp"),
        price=raw.get("price"),
        amount=raw.get("amount"),
        side=raw.get("side", "unknown"),
    )


def _convert_user_trade(raw: Dict[str, Any]) -> UserTrade:
    """Convert raw API response to UserTrade."""
    return UserTrade(
        id=raw.get("id"),
        timestamp=raw.get("timestamp"),
        price=raw.get("price"),
        amount=raw.get("amount"),
        side=raw.get("side", "unknown"),
        order_id=raw.get("orderId"),
    )


def _convert_order(raw: Dict[str, Any]) -> Order:
    """Convert raw API response to Order."""
    return Order(
        id=raw.get("id"),
        market_id=raw.get("marketId"),
        outcome_id=raw.get("outcomeId"),
        side=raw.get("side"),
        type=raw.get("type"),
        amount=raw.get("amount"),
        status=raw.get("status"),
        filled=raw.get("filled"),
        remaining=raw.get("remaining"),
        timestamp=raw.get("timestamp"),
        price=raw.get("price"),
        fee=raw.get("fee"),
    )


def _convert_position(raw: Dict[str, Any]) -> Position:
    """Convert raw API response to Position."""
    return Position(
        market_id=raw.get("marketId"),
        outcome_id=raw.get("outcomeId"),
        outcome_label=raw.get("outcomeLabel"),
        size=raw.get("size"),
        entry_price=raw.get("entryPrice"),
        current_price=raw.get("currentPrice"),
        unrealized_pnl=raw.get("unrealizedPnL"),
        realized_pnl=raw.get("realizedPnL"),
    )


def _convert_balance(raw: Dict[str, Any]) -> Balance:
    """Convert raw API response to Balance."""
    return Balance(
        currency=raw.get("currency"),
        total=raw.get("total"),
        available=raw.get("available"),
        locked=raw.get("locked"),
    )


def _convert_execution_result(raw: Dict[str, Any]) -> ExecutionPriceResult:
    """Convert raw API response to ExecutionPriceResult."""
    return ExecutionPriceResult(
        price=raw.get("price", 0),
        filled_amount=raw.get("filledAmount", 0),
        fully_filled=raw.get("fullyFilled", False),
    )


class Exchange(ABC):
    """
    Base class for prediction market exchanges.
    
    This provides a unified interface for interacting with different
    prediction market platforms (Polymarket, Kalshi, etc.).
    """
    
    def __init__(
        self,
        exchange_name: str,
        api_key: Optional[str] = None,
        private_key: Optional[str] = None,
        base_url: str = "http://localhost:3847",
        auto_start_server: bool = True,
        proxy_address: Optional[str] = None,
        signature_type: Optional[Any] = None,
    ):
        """
        Initialize an exchange client.
        
        Args:
            exchange_name: Name of the exchange ("polymarket" or "kalshi")
            api_key: API key for authentication (optional)
            private_key: Private key for authentication (optional)
            base_url: Base URL of the PMXT sidecar server
            auto_start_server: Automatically start server if not running (default: True)
        """
        self.exchange_name = exchange_name.lower()
        self.api_key = api_key
        self.private_key = private_key
        self.proxy_address = proxy_address
        self.signature_type = signature_type
        self.markets: Dict[str, "UnifiedMarket"] = {}
        self.markets_by_slug: Dict[str, "UnifiedMarket"] = {}
        self._loaded_markets: bool = False
        
        # Initialize server manager
        self._server_manager = ServerManager(base_url)
        
        # Ensure server is running (unless disabled)
        if auto_start_server:
            try:
                self._server_manager.ensure_server_running()
                
                # Get the actual port the server is running on
                # (may differ from default if default port was busy)
                actual_port = self._server_manager.get_running_port()
                base_url = f"http://localhost:{actual_port}"
                
            except Exception as e:
                raise Exception(
                    f"Failed to start PMXT server: {e}\n\n"
                    f"Please ensure 'pmxtjs' is installed: npm install -g pmxtjs\n"
                    f"Or start the server manually: pmxt-server"
                )
        
        # Configure the API client with the actual base URL
        config = Configuration(host=base_url)
        self._api_client = ApiClient(configuration=config)

        # Add access token from lock file (with retry for timing issues)
        server_info = None
        for attempt in range(5):
            server_info = self._server_manager.get_server_info()
            if server_info and 'accessToken' in server_info:
                break
            if attempt < 4:
                import time
                time.sleep(0.1)

        if server_info and 'accessToken' in server_info:
            self._api_client.default_headers['x-pmxt-access-token'] = server_info['accessToken']

        self._api = DefaultApi(api_client=self._api_client)
    
    def close(self):
        """No-op for now, kept for API compatibility with TS."""
        pass
    
    def _handle_response(self, response: Dict[str, Any]) -> Any:
        """Handle API response and extract data."""
        if not response.get("success"):
            error = response.get("error", {})
            if isinstance(error, str):
                raise Exception(error)
            raise Exception(error.get("message", "Unknown error"))
        return response.get("data")
    
    def _extract_api_error(self, e: Exception) -> str:
        """Extract clean error message from ApiException body if possible."""
        if isinstance(e, ApiException) and hasattr(e, "body") and e.body:
            try:
                body_json = json.loads(e.body)
                if not body_json.get("success") and "error" in body_json:
                    error_detail = body_json["error"]
                    if isinstance(error_detail, dict):
                        return error_detail.get("message", str(e))
                    elif isinstance(error_detail, str):
                        return error_detail
            except:
                pass
        return str(e)

    def _get_credentials_dict(self) -> Optional[Dict[str, Any]]:
        """Build credentials dictionary for API requests."""
        if not self.api_key and not self.private_key:
            return None
        
        creds = {}
        if self.api_key:
            creds["apiKey"] = self.api_key
        if self.private_key:
            creds["privateKey"] = self.private_key
        if self.proxy_address:
            creds["funderAddress"] = self.proxy_address
        if self.signature_type is not None:
            creds["signatureType"] = self.signature_type
        return creds if creds else None

    @property
    def has(self) -> Dict[str, Any]:
        """
        Capability map indicating which methods this exchange supports.

        Values:
            True      - natively supported
            False     - not available
            'emulated' - available via workaround (polling, approximation, etc.)

        Example:
            >>> if exchange.has['fetchOHLCV']:
            ...     candles = exchange.fetch_ohlcv(outcome_id, resolution='1h')
        """
        if not hasattr(self, '_has_cache'):
            try:
                url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/has"
                headers = {"Accept": "application/json"}
                headers.update(self._api_client.default_headers)
                response = self._api_client.call_api(
                    method="GET",
                    url=url,
                    header_params=headers,
                )
                response.read()
                data_json = json.loads(response.data)
                self._has_cache = self._handle_response(data_json)
            except Exception:
                self._has_cache = {}
        return self._has_cache

    # Low-Level API Access

    def _call_method(self, method_name: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """Call any exchange method on the server by name."""
        try:
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/{method_name}"
            body: Dict[str, Any] = {"args": [params] if params is not None else []}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._api_client.default_headers)
            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers,
            )
            response.read()
            data_json = json.loads(response.data)
            return self._handle_response(data_json)
        except ApiException as e:
            raise Exception(f"Failed to call '{method_name}': {self._extract_api_error(e)}") from None

    def call_api(self, operation_id: str, params: Optional[Dict[str, Any]] = None) -> Any:
        """
        Call an exchange-specific REST endpoint by its operationId.
        This provides direct access to all implicit API methods defined in
        the exchange's OpenAPI spec (e.g., Polymarket CLOB, Kalshi trading API).

        Args:
            operation_id: The operationId (or auto-generated name) of the endpoint
            params: Optional parameters to pass to the endpoint

        Returns:
            The raw response data from the exchange

        Example:
            >>> result = exchange.call_api('getMarket', {'condition_id': '0x...'})
        """
        try:
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/callApi"

            body = {"args": [operation_id, params]}
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._api_client.default_headers)

            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers
            )
            response.read()
            data_json = json.loads(response.data)
            return self._handle_response(data_json)
        except ApiException as e:
            raise Exception(f"Failed to call API '{operation_id}': {self._extract_api_error(e)}") from None

    # Market Data Methods

    def load_markets(self, reload: bool = False) -> Dict[str, UnifiedMarket]:
        """
        Load and cache all markets from the exchange into self.markets.
        Subsequent calls return the cached result without hitting the API again.

        Use this for stable pagination — fetch_markets() always hits the API so
        repeated calls with different offsets may return inconsistent results if
        the exchange reorders markets between requests. Call load_markets() once,
        then paginate over list(exchange.markets.values()) locally.

        Args:
            reload: Force a fresh fetch even if markets are already loaded

        Returns:
            Dict[str, UnifiedMarket] - All markets indexed by marketId

        Example:
            exchange.load_markets()
            all = list(exchange.markets.values())
            page1 = all[:100]
            page2 = all[100:200]
        """
        if self._loaded_markets and not reload:
            return self.markets

        markets = self.fetch_markets()

        self.markets = {}
        self.markets_by_slug = {}

        for market in markets:
            self.markets[market.market_id] = market

        self._loaded_markets = True
        return self.markets

    def fetch_markets(self, query: Optional[str] = None, **kwargs) -> List[UnifiedMarket]:
        """
        Get active markets from the exchange.

        Args:
            query: Optional search keyword
            **kwargs: Additional parameters (limit, offset, sort, search_in)

        Returns:
            List of unified markets

        Example:
            >>> markets = exchange.fetch_markets("Trump", limit=20, sort="volume")
        """
        try:
            body_dict = {"args": []}

            # Prepare arguments
            search_params = {}
            if query:
                search_params["query"] = query

            # Add any extra keyword arguments
            for key, value in kwargs.items():
                search_params[key] = value

            if search_params:
                body_dict["args"] = [search_params]
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchMarketsRequest.from_dict(body_dict)
            
            response = self._api.fetch_markets(
                exchange=self.exchange_name,
                fetch_markets_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_market(m) for m in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch markets: {self._extract_api_error(e)}") from None

    def fetch_events(self, query: Optional[str] = None, **kwargs) -> List[UnifiedEvent]:
        """
        Fetch events with optional keyword search.
        Events group related markets together.

        Args:
            query: Optional search keyword
            **kwargs: Additional parameters (limit, offset, search_in)

        Returns:
            List of unified events

        Example:
            >>> events = exchange.fetch_events("Election", limit=10)
        """
        try:
            body_dict = {"args": []}

            # Prepare arguments
            search_params = {}
            if query:
                search_params["query"] = query

            # Add any extra keyword arguments
            for key, value in kwargs.items():
                search_params[key] = value

            if search_params:
                body_dict["args"] = [search_params]
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchEventsRequest.from_dict(body_dict)
            
            response = self._api.fetch_events(
                exchange=self.exchange_name,
                fetch_events_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_event(e) for e in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch events: {self._extract_api_error(e)}") from None

    def fetch_market(
        self,
        market_id: Optional[str] = None,
        outcome_id: Optional[str] = None,
        event_id: Optional[str] = None,
        slug: Optional[str] = None,
        query: Optional[str] = None,
        **kwargs
    ) -> UnifiedMarket:
        """
        Fetch a single market by lookup parameters.
        Returns the first matching market or raises an exception if not found.

        Args:
            market_id: Direct lookup by market ID
            outcome_id: Reverse lookup by outcome ID
            event_id: Find market belonging to an event
            slug: Lookup by slug/ticker
            query: Search keyword
            **kwargs: Additional parameters (limit, status, etc.)

        Returns:
            A single unified market

        Raises:
            Exception: If no market matches the parameters

        Example:
            >>> market = exchange.fetch_market(market_id='663583')
            >>> market = exchange.fetch_market(slug='will-trump-win')
        """
        try:
            search_params = {}
            if market_id:
                search_params["marketId"] = market_id
            if outcome_id:
                search_params["outcomeId"] = outcome_id
            if event_id:
                search_params["eventId"] = event_id
            if slug:
                search_params["slug"] = slug
            if query:
                search_params["query"] = query

            # Convert snake_case kwargs to camelCase
            key_map = {
                "search_in": "searchIn",
                "similarity_threshold": "similarityThreshold",
            }
            for key, value in kwargs.items():
                camel_key = key_map.get(key, key)
                search_params[camel_key] = value

            body_dict = {"args": [search_params] if search_params else []}

            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds

            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchMarket"

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._api_client.default_headers)

            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body_dict,
                header_params=headers
            )

            response.read()
            data_json = json.loads(response.data)

            data = self._handle_response(data_json)
            return _convert_market(data)
        except Exception as e:
            raise Exception(f"Failed to fetch market: {self._extract_api_error(e)}") from None

    def fetch_event(
        self,
        event_id: Optional[str] = None,
        slug: Optional[str] = None,
        query: Optional[str] = None,
        **kwargs
    ) -> UnifiedEvent:
        """
        Fetch a single event by lookup parameters.
        Returns the first matching event or raises an exception if not found.

        Args:
            event_id: Direct lookup by event ID
            slug: Lookup by event slug
            query: Search keyword
            **kwargs: Additional parameters (limit, status, etc.)

        Returns:
            A single unified event

        Raises:
            Exception: If no event matches the parameters

        Example:
            >>> event = exchange.fetch_event(event_id='TRUMP25DEC')
            >>> event = exchange.fetch_event(slug='us-election')
        """
        try:
            search_params = {}
            if event_id:
                search_params["eventId"] = event_id
            if slug:
                search_params["slug"] = slug
            if query:
                search_params["query"] = query

            # Convert snake_case kwargs to camelCase
            key_map = {
                "search_in": "searchIn",
            }
            for key, value in kwargs.items():
                camel_key = key_map.get(key, key)
                search_params[camel_key] = value

            body_dict = {"args": [search_params] if search_params else []}

            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds

            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/fetchEvent"

            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._api_client.default_headers)

            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body_dict,
                header_params=headers
            )

            response.read()
            data_json = json.loads(response.data)

            data = self._handle_response(data_json)
            return _convert_event(data)
        except Exception as e:
            raise Exception(f"Failed to fetch event: {self._extract_api_error(e)}") from None

    # ----------------------------------------------------------------------------
    # Filtering Methods
    # ----------------------------------------------------------------------------

    def filter_markets(
        self,
        markets: List[UnifiedMarket],
        criteria: Union[str, MarketFilterCriteria, MarketFilterFunction]
    ) -> List[UnifiedMarket]:
        """
        Filter markets based on criteria or custom function.

        Args:
            markets: List of markets to filter
            criteria: Filter criteria object, string (simple text search), or predicate function
            
        Returns:
            Filtered list of markets
            
        Example:
            >>> api.filter_markets(markets, "Trump")
            >>> api.filter_markets(markets, {"volume_24h": {"min": 1000}})
            >>> api.filter_markets(markets, lambda m: m.yes and m.yes.price > 0.5)
        """
        # Handle predicate function
        if callable(criteria):
            return list(filter(criteria, markets))

        # Handle simple string search
        if isinstance(criteria, str):
            lower_query = criteria.lower()
            return [m for m in markets if m.title and lower_query in m.title.lower()]

        # Handle criteria object
        params: MarketFilterCriteria = criteria # type: ignore
        results = []
        
        for market in markets:
            # Text search
            if "text" in params:
                lower_query = params["text"].lower()
                search_in = params.get("search_in", ["title"])
                match = False
                
                if "title" in search_in and market.title and lower_query in market.title.lower():
                    match = True
                elif "description" in search_in and market.description and lower_query in market.description.lower():
                    match = True
                elif "category" in search_in and market.category and lower_query in market.category.lower():
                    match = True
                elif "tags" in search_in and market.tags and any(lower_query in t.lower() for t in market.tags):
                    match = True
                elif "outcomes" in search_in and market.outcomes and any(lower_query in o.label.lower() for o in market.outcomes):
                    match = True
                
                if not match:
                    continue

            # Category filter
            if "category" in params:
                if market.category != params["category"]:
                    continue

            # Tags filter (match ANY)
            if "tags" in params and params["tags"]:
                if not market.tags:
                    continue
                query_tags = [t.lower() for t in params["tags"]]
                market_tags = [t.lower() for t in market.tags]
                if not any(t in market_tags for t in query_tags):
                    continue

            # Volume 24h
            if "volume_24h" in params:
                f = params["volume_24h"]
                val = market.volume_24h
                if "min" in f and val < f["min"]: continue
                if "max" in f and val > f["max"]: continue

            # Volume
            if "volume" in params:
                f = params["volume"]
                val = market.volume or 0
                if "min" in f and val < f["min"]: continue
                if "max" in f and val > f["max"]: continue

            # Liquidity
            if "liquidity" in params:
                f = params["liquidity"]
                val = market.liquidity
                if "min" in f and val < f["min"]: continue
                if "max" in f and val > f["max"]: continue
            
            # Open Interest
            if "open_interest" in params:
                f = params["open_interest"]
                val = market.open_interest or 0
                if "min" in f and val < f["min"]: continue
                if "max" in f and val > f["max"]: continue

            # Resolution Date
            if "resolution_date" in params:
                f = params["resolution_date"]
                val = market.resolution_date
                
                if not val:
                     continue
                
                # Ensure val is timezone-aware if the filter dates are, or naive if filter dates are.
                # Assuming standard library comparison works (or both are TZ aware/naive).
                if "before" in f and val >= f["before"]: continue
                if "after" in f and val <= f["after"]: continue

            # Price filter
            if "price" in params:
                f = params["price"]
                outcome_key = f.get("outcome")
                if outcome_key:
                    outcome = getattr(market, outcome_key, None)
                    if not outcome: continue
                    if "min" in f and outcome.price < f["min"]: continue
                    if "max" in f and outcome.price > f["max"]: continue

            # Price Change 24h
            if "price_change_24h" in params:
                f = params["price_change_24h"]
                outcome_key = f.get("outcome")
                if outcome_key:
                    outcome = getattr(market, outcome_key, None)
                    if not outcome or outcome.price_change_24h is None: continue
                    if "min" in f and outcome.price_change_24h < f["min"]: continue
                    if "max" in f and outcome.price_change_24h > f["max"]: continue

            results.append(market)
            
        return results

    def filter_events(
        self,
        events: List[UnifiedEvent],
        criteria: Union[str, EventFilterCriteria, EventFilterFunction]
    ) -> List[UnifiedEvent]:
        """
        Filter events based on criteria or custom function.

        Args:
            events: List of events to filter
            criteria: Filter criteria object, string, or function
            
        Returns:
            Filtered list of events
        """
        # Handle predicate function
        if callable(criteria):
            return list(filter(criteria, events))

        # Handle simple string search
        if isinstance(criteria, str):
            lower_query = criteria.lower()
            return [e for e in events if e.title and lower_query in e.title.lower()]

        # Handle criteria object
        params: EventFilterCriteria = criteria # type: ignore
        results = []

        for event in events:
            # Text search
            if "text" in params:
                lower_query = params["text"].lower()
                search_in = params.get("search_in", ["title"])
                match = False
                
                if "title" in search_in and event.title and lower_query in event.title.lower():
                    match = True
                elif "description" in search_in and event.description and lower_query in event.description.lower():
                    match = True
                elif "category" in search_in and event.category and lower_query in event.category.lower():
                    match = True
                elif "tags" in search_in and event.tags and any(lower_query in t.lower() for t in event.tags):
                    match = True
                
                if not match:
                    continue

            # Category
            if "category" in params:
                if event.category != params["category"]:
                    continue

            # Tags
            if "tags" in params and params["tags"]:
                if not event.tags:
                    continue
                query_tags = [t.lower() for t in params["tags"]]
                event_tags = [t.lower() for t in event.tags]
                if not any(t in event_tags for t in query_tags):
                    continue

            # Market Count
            if "market_count" in params:
                f = params["market_count"]
                count = len(event.markets)
                if "min" in f and count < f["min"]: continue
                if "max" in f and count > f["max"]: continue

            # Total Volume
            if "total_volume" in params:
                f = params["total_volume"]
                total_vol = sum(m.volume_24h for m in event.markets)
                if "min" in f and total_vol < f["min"]: continue
                if "max" in f and total_vol > f["max"]: continue

            results.append(event)
            
        return results

    def fetch_ohlcv(
        self,
        outcome_id: str,
        resolution: Optional[str] = None,
        limit: Optional[int] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        **kwargs
    ) -> List[PriceCandle]:
        """
        Get historical price candles.

        **CRITICAL**: Use outcome.outcome_id, not market.market_id.
        - Polymarket: outcome.outcome_id is the CLOB Token ID
        - Kalshi: outcome.outcome_id is the Market Ticker

        Args:
            outcome_id: Outcome ID (from market.outcomes[].outcome_id)
            resolution: Candle resolution (e.g., "1h", "1d")
            limit: Maximum number of candles to return
            start: Start datetime for historical data
            end: End datetime for historical data
            **kwargs: Additional parameters

        Returns:
            List of price candles

        Example:
            >>> markets = exchange.fetch_markets(query="Trump")
            >>> outcome_id = markets[0].outcomes[0].outcome_id
            >>> candles = exchange.fetch_ohlcv(
            ...     outcome_id,
            ...     resolution="1h",
            ...     limit=100
            ... )
        """
        try:
            params_dict = {}
            if resolution:
                params_dict["resolution"] = resolution
            if start:
                params_dict["start"] = start.isoformat()
            if end:
                params_dict["end"] = end.isoformat()
            if limit:
                params_dict["limit"] = limit

            # Add any extra keyword arguments
            for key, value in kwargs.items():
                if key not in params_dict:
                    params_dict[key] = value
            
            request_body_dict = {"args": [outcome_id, params_dict]}
            request_body = internal_models.FetchOHLCVRequest.from_dict(request_body_dict)
            
            response = self._api.fetch_ohlcv(
                exchange=self.exchange_name,
                fetch_ohlcv_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_candle(c) for c in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch OHLCV: {self._extract_api_error(e)}") from None
    
    def fetch_order_book(self, outcome_id: str) -> OrderBook:
        """
        Get current order book for an outcome.
        
        Args:
            outcome_id: Outcome ID
            
        Returns:
            Current order book
            
        Example:
            >>> order_book = exchange.fetch_order_book(outcome_id)
            >>> print(f"Best bid: {order_book.bids[0].price}")
            >>> print(f"Best ask: {order_book.asks[0].price}")
        """
        try:
            body_dict = {"args": [outcome_id]}
            request_body = internal_models.FetchOrderBookRequest.from_dict(body_dict)
            
            response = self._api.fetch_order_book(
                exchange=self.exchange_name,
                fetch_order_book_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order_book(data)
        except ApiException as e:
            raise Exception(f"Failed to fetch order book: {self._extract_api_error(e)}") from None
    
    def fetch_trades(
        self,
        outcome_id: str,
        limit: Optional[int] = None,
        since: Optional[int] = None,
        **kwargs
    ) -> List[Trade]:
        """
        Get trade history for an outcome.

        Note: Polymarket requires API key.

        Args:
            outcome_id: Outcome ID (from market.outcomes[].outcome_id)
            limit: Maximum number of trades to return
            since: Return trades since this timestamp (Unix milliseconds)
            **kwargs: Additional parameters

        Returns:
            List of trades

        Example:
            >>> trades = exchange.fetch_trades(outcome_id, limit=50)
        """
        try:
            params_dict = {}
            if limit:
                params_dict["limit"] = limit
            if since:
                params_dict["since"] = since

            # Add any extra keyword arguments
            for key, value in kwargs.items():
                if key not in params_dict:
                    params_dict[key] = value
            
            request_body_dict = {"args": [outcome_id, params_dict]}
            request_body = internal_models.FetchTradesRequest.from_dict(request_body_dict)
            
            response = self._api.fetch_trades(
                exchange=self.exchange_name,
                fetch_trades_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_trade(t) for t in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch trades: {self._extract_api_error(e)}") from None
    
    # WebSocket Streaming Methods
    
    def watch_order_book(self, outcome_id: str, limit: Optional[int] = None) -> OrderBook:
        """
        Watch real-time order book updates via WebSocket.
        
        Returns a promise that resolves with the next order book update.
        Call repeatedly in a loop to stream updates (CCXT Pro pattern).
        
        Args:
            outcome_id: Outcome ID to watch
            limit: Optional depth limit for order book
            
        Returns:
            Next order book update
            
        Example:
            >>> # Stream order book updates
            >>> while True:
            ...     order_book = exchange.watch_order_book(outcome_id)
            ...     print(f"Best bid: {order_book.bids[0].price}")
            ...     print(f"Best ask: {order_book.asks[0].price}")
        """
        try:
            args = [outcome_id]
            if limit is not None:
                args.append(limit)
            
            body_dict = {"args": args}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.WatchOrderBookRequest.from_dict(body_dict)
            
            response = self._api.watch_order_book(
                exchange=self.exchange_name,
                watch_order_book_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order_book(data)
        except ApiException as e:
            raise Exception(f"Failed to watch order book: {self._extract_api_error(e)}") from None
    
    def watch_trades(
        self,
        outcome_id: str,
        since: Optional[int] = None,
        limit: Optional[int] = None
    ) -> List[Trade]:
        """
        Watch real-time trade updates via WebSocket.
        
        Returns a promise that resolves with the next trade(s).
        Call repeatedly in a loop to stream updates (CCXT Pro pattern).
        
        Args:
            outcome_id: Outcome ID to watch
            since: Optional timestamp to filter trades from
            limit: Optional limit for number of trades
            
        Returns:
            Next trade update(s)
            
        Example:
            >>> # Stream trade updates
            >>> while True:
            ...     trades = exchange.watch_trades(outcome_id)
            ...     for trade in trades:
            ...         print(f"Trade: {trade.price} @ {trade.amount}")
        """
        try:
            args = [outcome_id]
            if since is not None:
                args.append(since)
            if limit is not None:
                args.append(limit)
            
            body_dict = {"args": args}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.WatchTradesRequest.from_dict(body_dict)
            
            response = self._api.watch_trades(
                exchange=self.exchange_name,
                watch_trades_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_trade(t) for t in data]
        except ApiException as e:
            raise Exception(f"Failed to watch trades: {self._extract_api_error(e)}") from None

    def watch_prices(self, market_address: str, callback: Optional[Any] = None) -> Any:
        """
        Watch real-time AMM price updates via WebSocket.
        
        Args:
            market_address: Market contract address
            callback: Optional callback for price updates (if supported by implementation)
            
        Returns:
            Next price update
        """
        try:
            body_dict = {"args": [market_address]}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.WatchPricesRequest.from_dict(body_dict)
            
            response = self._api.watch_prices(
                exchange=self.exchange_name,
                watch_prices_request=request_body,
            )
            
            return self._handle_response(response.to_dict())
        except ApiException as e:
            raise Exception(f"Failed to watch prices: {self._extract_api_error(e)}") from None

    def watch_user_positions(self, callback: Optional[Any] = None) -> List[Position]:
        """
        Watch real-time user position updates via WebSocket.
        Requires API key authentication.
        
        Args:
            callback: Optional callback for position updates
            
        Returns:
            Next position update
        """
        try:
            body_dict = {}
            
            # Add credentials (required)
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.WatchUserPositionsRequest.from_dict(body_dict)
            
            response = self._api.watch_user_positions(
                exchange=self.exchange_name,
                watch_user_positions_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_position(p) for p in data]
        except ApiException as e:
            raise Exception(f"Failed to watch user positions: {self._extract_api_error(e)}") from None

    def watch_user_transactions(self, callback: Optional[Any] = None) -> Any:
        """
        Watch real-time user transaction updates via WebSocket.
        Requires API key authentication.
        
        Args:
            callback: Optional callback for transaction updates
            
        Returns:
            Next transaction update
        """
        try:
            body_dict = {}
            
            # Add credentials (required)
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.WatchUserPositionsRequest.from_dict(body_dict)
            
            response = self._api.watch_user_transactions(
                exchange=self.exchange_name,
                watch_user_positions_request=request_body,
            )
            
            return self._handle_response(response.to_dict())
        except ApiException as e:
            raise Exception(f"Failed to watch user transactions: {self._extract_api_error(e)}") from None
    
    # Trading Methods (require authentication)
    
    def create_order(
        self,
        market_id: Optional[str] = None,
        outcome_id: Optional[str] = None,
        side: Literal["buy", "sell"] = "buy",
        type: Literal["market", "limit"] = "market",
        amount: float = 0,
        price: Optional[float] = None,
        fee: Optional[int] = None,
        outcome: Optional[MarketOutcome] = None,
    ) -> Order:
        """
        Create a new order.

        You can specify the market either with explicit market_id/outcome_id,
        or by passing an outcome object directly (e.g., market.yes).

        Args:
            market_id: Market ID (or use outcome instead)
            outcome_id: Outcome ID (or use outcome instead)
            side: Order side (buy/sell)
            type: Order type (market/limit)
            amount: Number of contracts
            price: Limit price (required for limit orders, 0.0-1.0)
            fee: Optional fee rate (e.g., 1000 for 0.1%)
            outcome: A MarketOutcome object (e.g., market.yes). Extracts market_id and outcome_id automatically.

        Returns:
            Created order

        Example:
            >>> # Using explicit IDs:
            >>> order = exchange.create_order(
            ...     market_id="663583",
            ...     outcome_id="10991849...",
            ...     side="buy",
            ...     type="limit",
            ...     amount=10,
            ...     price=0.55
            ... )
            >>>
            >>> # Using outcome shorthand:
            >>> order = exchange.create_order(
            ...     outcome=market.yes,
            ...     side="buy",
            ...     type="market",
            ...     amount=10,
            ... )
        """
        try:
            # Resolve outcome shorthand
            if outcome is not None:
                if market_id is not None or outcome_id is not None:
                    raise ValueError(
                        "Cannot specify both 'outcome' and 'market_id'/'outcome_id'. Use one or the other."
                    )
                if not outcome.market_id:
                    raise ValueError(
                        "outcome.market_id is not set. Ensure the outcome comes from a fetched market."
                    )
                market_id = outcome.market_id
                outcome_id = outcome.outcome_id
            elif market_id is None or outcome_id is None:
                raise ValueError(
                    "Either provide 'outcome' or both 'market_id' and 'outcome_id'."
                )

            params_dict = {
                "marketId": market_id,
                "outcomeId": outcome_id,
                "side": side,
                "type": type,
                "amount": amount,
            }
            if price is not None:
                params_dict["price"] = price
            if fee is not None:
                params_dict["fee"] = fee

            request_body_dict = {"args": [params_dict]}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                request_body_dict["credentials"] = creds
            
            request_body = internal_models.CreateOrderRequest.from_dict(request_body_dict)
            
            response = self._api.create_order(
                exchange=self.exchange_name,
                create_order_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order(data)
        except ApiException as e:
            raise Exception(f"Failed to create order: {self._extract_api_error(e)}") from None
    
    def cancel_order(self, order_id: str) -> Order:
        """
        Cancel an open order.
        
        Args:
            order_id: Order ID to cancel
            
        Returns:
            Cancelled order
        """
        try:
            body_dict = {"args": [order_id]}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.CancelOrderRequest.from_dict(body_dict)
            
            response = self._api.cancel_order(
                exchange=self.exchange_name,
                cancel_order_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order(data)
        except ApiException as e:
            raise Exception(f"Failed to cancel order: {self._extract_api_error(e)}") from None
    
    def fetch_order(self, order_id: str) -> Order:
        """
        Get details of a specific order.
        
        Args:
            order_id: Order ID
            
        Returns:
            Order details
        """
        try:
            body_dict = {"args": [order_id]}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchOrderRequest.from_dict(body_dict)
            
            response = self._api.fetch_order(
                exchange=self.exchange_name,
                fetch_order_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return _convert_order(data)
        except ApiException as e:
            raise Exception(f"Failed to fetch order: {self._extract_api_error(e)}") from None
    
    def fetch_open_orders(self, market_id: Optional[str] = None) -> List[Order]:
        """
        Get all open orders, optionally filtered by market.
        
        Args:
            market_id: Optional market ID to filter by
            
        Returns:
            List of open orders
        """
        try:
            args = []
            if market_id:
                args.append(market_id)
            
            body_dict = {"args": args}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchOpenOrdersRequest.from_dict(body_dict)
            
            response = self._api.fetch_open_orders(
                exchange=self.exchange_name,
                fetch_open_orders_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_order(o) for o in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch open orders: {self._extract_api_error(e)}") from None
    
    def fetch_my_trades(
        self,
        outcome_id: Optional[str] = None,
        market_id: Optional[str] = None,
        since: Optional[Any] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> List[UserTrade]:
        """
        Get trades made by the authenticated user.

        Args:
            outcome_id: Filter to a specific outcome/ticker
            market_id: Filter to a specific market
            since: Only return trades after this datetime
            limit: Maximum number of results
            cursor: Pagination cursor from a previous call (Kalshi)

        Returns:
            List of user trades

        Example:
            trades = exchange.fetch_my_trades(limit=50)
        """
        params: Dict[str, Any] = {}
        if outcome_id is not None:
            params["outcomeId"] = outcome_id
        if market_id is not None:
            params["marketId"] = market_id
        if since is not None:
            params["since"] = since.isoformat() if hasattr(since, "isoformat") else since
        if limit is not None:
            params["limit"] = limit
        if cursor is not None:
            params["cursor"] = cursor
        data = self._call_method("fetchMyTrades", params or None)
        return [_convert_user_trade(t) for t in (data or [])]

    def fetch_closed_orders(
        self,
        market_id: Optional[str] = None,
        since: Optional[Any] = None,
        until: Optional[Any] = None,
        limit: Optional[int] = None,
    ) -> List[Order]:
        """
        Get filled and cancelled orders.

        Args:
            market_id: Filter to a specific market
            since: Only return orders after this datetime
            until: Only return orders before this datetime
            limit: Maximum number of results

        Returns:
            List of closed orders

        Example:
            orders = exchange.fetch_closed_orders(market_id="some-market")
        """
        params: Dict[str, Any] = {}
        if market_id is not None:
            params["marketId"] = market_id
        if since is not None:
            params["since"] = since.isoformat() if hasattr(since, "isoformat") else since
        if until is not None:
            params["until"] = until.isoformat() if hasattr(until, "isoformat") else until
        if limit is not None:
            params["limit"] = limit
        data = self._call_method("fetchClosedOrders", params or None)
        return [_convert_order(o) for o in (data or [])]

    def fetch_all_orders(
        self,
        market_id: Optional[str] = None,
        since: Optional[Any] = None,
        until: Optional[Any] = None,
        limit: Optional[int] = None,
    ) -> List[Order]:
        """
        Get all orders (open + closed), sorted newest-first.

        Args:
            market_id: Filter to a specific market
            since: Only return orders after this datetime
            until: Only return orders before this datetime
            limit: Maximum number of results

        Returns:
            List of orders

        Example:
            orders = exchange.fetch_all_orders()
        """
        params: Dict[str, Any] = {}
        if market_id is not None:
            params["marketId"] = market_id
        if since is not None:
            params["since"] = since.isoformat() if hasattr(since, "isoformat") else since
        if until is not None:
            params["until"] = until.isoformat() if hasattr(until, "isoformat") else until
        if limit is not None:
            params["limit"] = limit
        data = self._call_method("fetchAllOrders", params or None)
        return [_convert_order(o) for o in (data or [])]

    def fetch_markets_paginated(
        self,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> PaginatedMarketsResult:
        """
        Fetch markets with cursor-based pagination.

        Unlike fetch_markets(), this takes a stable snapshot on the first call
        and returns a cursor you can use to fetch the next page without drift.

        Args:
            limit: Page size
            cursor: Opaque cursor returned by the previous call

        Returns:
            PaginatedMarketsResult with data, total, and next_cursor

        Example:
            page = exchange.fetch_markets_paginated(limit=100)
            while page.next_cursor:
                page = exchange.fetch_markets_paginated(limit=100, cursor=page.next_cursor)
        """
        params: Dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if cursor is not None:
            params["cursor"] = cursor
        raw = self._call_method("fetchMarketsPaginated", params or None)
        return PaginatedMarketsResult(
            data=[_convert_market(m) for m in raw.get("data", [])],
            total=raw.get("total", 0),
            next_cursor=raw.get("nextCursor"),
        )

    # Account Methods

    def fetch_positions(self) -> List[Position]:
        """
        Get current positions across all markets.
        
        Returns:
            List of positions
        """
        try:
            body_dict = {"args": []}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            request_body = internal_models.FetchPositionsRequest.from_dict(body_dict)
            
            response = self._api.fetch_positions(
                exchange=self.exchange_name,
                fetch_positions_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_position(p) for p in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch positions: {self._extract_api_error(e)}") from None
    
    def fetch_balance(self) -> List[Balance]:
        """
        Get account balance.
        
        Returns:
            List of balances (by currency)
        """
        try:
            body_dict = {"args": []}
            
            # Add credentials if available
            creds = self._get_credentials_dict()
            if creds:
                body_dict["credentials"] = creds
            
            # Note: Generator name for this request might be reused from FetchPositionsRequest
            # if the schemas are identical (empty args array)
            request_body = internal_models.FetchPositionsRequest.from_dict(body_dict)
            
            response = self._api.fetch_balance(
                exchange=self.exchange_name,
                fetch_positions_request=request_body,
            )
            
            data = self._handle_response(response.to_dict())
            return [_convert_balance(b) for b in data]
        except ApiException as e:
            raise Exception(f"Failed to fetch balance: {self._extract_api_error(e)}") from None

    def get_execution_price(
        self,
        order_book: OrderBook,
        side: Literal["buy", "sell"],
        amount: float
    ) -> float:
        """
        Calculate the average execution price for a given amount.
        
        Args:
            order_book: The current order book
            side: "buy" or "sell"
            amount: The amount to execute
            
        Returns:
            The volume-weighted average price, or 0 if insufficient liquidity
        """
        result = self.get_execution_price_detailed(order_book, side, amount)
        return result.price if result.fully_filled else 0

    def get_execution_price_detailed(
        self,
        order_book: OrderBook,
        side: Literal["buy", "sell"],
        amount: float
    ) -> ExecutionPriceResult:
        """
        Calculate detailed execution price information.
        
        Args:
            order_book: The current order book
            side: "buy" or "sell"
            amount: The amount to execute
            
        Returns:
            Detailed execution result
        """
        try:
            # Convert order_book to dict for API call
            bids = [{"price": b.price, "size": b.size} for b in order_book.bids]
            asks = [{"price": a.price, "size": a.size} for a in order_book.asks]
            ob_dict = {"bids": bids, "asks": asks, "timestamp": order_book.timestamp}

            body = {
                "args": [ob_dict, side, amount]
            }
            
            creds = self._get_credentials_dict()
            if creds:
                body["credentials"] = creds
                
            url = f"{self._api_client.configuration.host}/api/{self.exchange_name}/getExecutionPriceDetailed"
            
            headers = {"Content-Type": "application/json", "Accept": "application/json"}
            headers.update(self._api_client.default_headers)
            
            response = self._api_client.call_api(
                method="POST",
                url=url,
                body=body,
                header_params=headers
            )
            
            response.read()
            data_json = json.loads(response.data)
            
            data = self._handle_response(data_json)
            return _convert_execution_result(data)
        except Exception as e:
            raise Exception(f"Failed to get execution price: {self._extract_api_error(e)}") from None

