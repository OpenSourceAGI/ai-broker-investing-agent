"""
Finnhub Data Fetcher
Primary data source for stock quotes, historical data, and company information.

Free Tier Limits: 60 requests/minute.
Strategy: Use as primary source with rate limit handling.
"""

import os
import aiohttp
import asyncio
import structlog
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

logger = structlog.get_logger(__name__)

FINNHUB_BASE_URL = "https://finnhub.io/api/v1"


class FinnhubFetcher:
    """
    Async client for Finnhub with automatic rate limit handling.

    Features:
    - Circuit breaker: backs off after hitting rate limit
    - Async requests with timeout
    - Field mapping to internal schema (yfinance-compatible)
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('FINNHUB_API_KEY')
        self.base_url = FINNHUB_BASE_URL
        self._session = None
        self._is_exhausted = False
        self._last_reset = datetime.now()

    async def __aenter__(self):
        self._session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, *args):
        if self._session:
            await self._session.close()

    def is_available(self) -> bool:
        """Check if configured and quota remaining."""
        has_key = self.api_key is not None and self.api_key != ""

        # Reset exhausted flag after 1 minute (Finnhub limit window)
        if self._is_exhausted and (datetime.now() - self._last_reset).seconds > 60:
            self._is_exhausted = False
            self._last_reset = datetime.now()

        not_exhausted = not self._is_exhausted

        if not has_key:
            logger.debug("finnhub_unavailable", reason="no_api_key")
        elif self._is_exhausted:
            logger.debug("finnhub_unavailable", reason="rate_limit_exhausted")

        return has_key and not_exhausted

    async def _make_request(self, endpoint: str, params: Dict[str, str] = None) -> Optional[Dict]:
        """Make a request to Finnhub API."""
        if not self.is_available():
            return None

        if not self._session:
            self._session = aiohttp.ClientSession()

        params = params or {}
        params['token'] = self.api_key

        try:
            async with self._session.get(
                f"{self.base_url}{endpoint}",
                params=params,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 429:
                    logger.info("finnhub_rate_limit_hit",
                               message="Rate limit exceeded (60 requests/minute)")
                    self._is_exhausted = True
                    self._last_reset = datetime.now()
                    return None

                if response.status != 200:
                    logger.debug("finnhub_http_error",
                                status=response.status,
                                endpoint=endpoint)
                    return None

                try:
                    data = await response.json()
                except (ValueError, aiohttp.ContentTypeError) as e:
                    logger.debug("finnhub_malformed_json", error=str(e))
                    return None

                return data

        except asyncio.TimeoutError:
            logger.debug("finnhub_timeout", endpoint=endpoint)
            return None
        except Exception as e:
            logger.debug("finnhub_request_failed", endpoint=endpoint, error=str(e))
            return None

    async def get_quote(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetch current quote for a symbol.

        Returns dict with:
        - c: Current price
        - d: Change
        - dp: Percent change
        - h: High price of the day
        - l: Low price of the day
        - o: Open price of the day
        - pc: Previous close price
        - t: Timestamp
        """
        data = await self._make_request('/quote', {'symbol': symbol.upper()})

        if not data or data.get('c') is None or data.get('c') == 0:
            logger.debug("finnhub_no_quote", symbol=symbol)
            return None

        logger.debug("finnhub_quote_success", symbol=symbol, price=data.get('c'))
        return data

    async def get_profile(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetch company profile.

        Returns dict with:
        - country, currency, exchange, ipo
        - marketCapitalization, name, phone
        - shareOutstanding, ticker, weburl, logo
        - finnhubIndustry
        """
        data = await self._make_request('/stock/profile2', {'symbol': symbol.upper()})

        if not data or not data.get('name'):
            logger.debug("finnhub_no_profile", symbol=symbol)
            return None

        logger.debug("finnhub_profile_success", symbol=symbol, name=data.get('name'))
        return data

    async def get_metrics(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetch financial metrics (basic financials).

        Returns dict with metric sub-dict containing:
        - PE ratios, margins, growth rates
        - Beta, current ratio, debt metrics
        - 52-week high/low, etc.
        """
        data = await self._make_request('/stock/metric', {
            'symbol': symbol.upper(),
            'metric': 'all'
        })

        if not data or not data.get('metric'):
            logger.debug("finnhub_no_metrics", symbol=symbol)
            return None

        logger.debug("finnhub_metrics_success", symbol=symbol)
        return data

    async def get_candles(
        self,
        symbol: str,
        resolution: str = 'D',
        from_ts: int = None,
        to_ts: int = None
    ) -> Optional[Dict[str, Any]]:
        """
        Fetch historical OHLCV data.

        Args:
            symbol: Stock symbol
            resolution: 1, 5, 15, 30, 60, D, W, M
            from_ts: Unix timestamp for start
            to_ts: Unix timestamp for end

        Returns dict with:
        - c: List of close prices
        - h: List of high prices
        - l: List of low prices
        - o: List of open prices
        - t: List of timestamps
        - v: List of volumes
        - s: Status ('ok' or 'no_data')
        """
        if to_ts is None:
            to_ts = int(datetime.now().timestamp())
        if from_ts is None:
            from_ts = int((datetime.now() - timedelta(days=365)).timestamp())

        data = await self._make_request('/stock/candle', {
            'symbol': symbol.upper(),
            'resolution': resolution,
            'from': str(from_ts),
            'to': str(to_ts)
        })

        if not data or data.get('s') == 'no_data':
            logger.debug("finnhub_no_candles", symbol=symbol)
            return None

        logger.debug("finnhub_candles_success", symbol=symbol, count=len(data.get('t', [])))
        return data

    async def get_peers(self, symbol: str) -> Optional[List[str]]:
        """Fetch peer companies for a symbol."""
        data = await self._make_request('/stock/peers', {'symbol': symbol.upper()})

        if not data or not isinstance(data, list):
            logger.debug("finnhub_no_peers", symbol=symbol)
            return None

        return data

    async def get_recommendations(self, symbol: str) -> Optional[List[Dict]]:
        """Fetch analyst recommendations trend."""
        data = await self._make_request('/stock/recommendation', {'symbol': symbol.upper()})

        if not data or not isinstance(data, list):
            logger.debug("finnhub_no_recommendations", symbol=symbol)
            return None

        return data

    async def get_forex_rates(self, base_currency: str = 'USD') -> Optional[Dict[str, float]]:
        """Fetch forex rates for a base currency."""
        data = await self._make_request('/forex/rates', {'base': base_currency.upper()})

        if not data or not data.get('quote'):
            logger.debug("finnhub_no_forex", base=base_currency)
            return None

        return data.get('quote')

    async def get_company_name(self, symbol: str) -> Optional[str]:
        """Get company name from profile."""
        profile = await self.get_profile(symbol)
        if profile:
            return profile.get('name')
        return None

    async def get_financial_metrics(self, symbol: str) -> Optional[Dict[str, Any]]:
        """
        Fetch all available financial data and map to internal schema.
        Compatible with the existing fetcher interface.

        This combines quote, profile, and metrics into a single response
        that matches the yfinance-style output.
        """
        if not self.is_available():
            return None

        # Fetch quote, profile, and metrics in parallel
        quote_task = self.get_quote(symbol)
        profile_task = self.get_profile(symbol)
        metrics_task = self.get_metrics(symbol)

        quote, profile, metrics = await asyncio.gather(
            quote_task, profile_task, metrics_task,
            return_exceptions=True
        )

        # Handle exceptions
        if isinstance(quote, Exception):
            quote = None
        if isinstance(profile, Exception):
            profile = None
        if isinstance(metrics, Exception):
            metrics = None

        if not quote and not profile and not metrics:
            logger.debug("finnhub_no_data", symbol=symbol)
            return None

        # Build output in yfinance-compatible format
        output = {
            '_source': 'finnhub',
            'symbol': symbol
        }

        # From quote
        if quote:
            output['currentPrice'] = quote.get('c')
            output['regularMarketPrice'] = quote.get('c')
            output['previousClose'] = quote.get('pc')
            output['regularMarketOpen'] = quote.get('o')
            output['regularMarketDayHigh'] = quote.get('h')
            output['regularMarketDayLow'] = quote.get('l')
            output['regularMarketChange'] = quote.get('d')
            output['regularMarketChangePercent'] = quote.get('dp')

        # From profile
        if profile:
            output['currency'] = profile.get('currency')
            output['longName'] = profile.get('name')
            output['shortName'] = profile.get('name')
            output['exchange'] = profile.get('exchange')
            output['country'] = profile.get('country')
            output['sector'] = profile.get('finnhubIndustry')
            output['industry'] = profile.get('finnhubIndustry')
            output['website'] = profile.get('weburl')
            output['logo'] = profile.get('logo')

            if profile.get('marketCapitalization'):
                # Finnhub returns market cap in millions
                output['marketCap'] = profile['marketCapitalization'] * 1e6

            if profile.get('shareOutstanding'):
                # Finnhub returns shares in millions
                output['sharesOutstanding'] = profile['shareOutstanding'] * 1e6

        # From metrics
        if metrics and metrics.get('metric'):
            m = metrics['metric']

            # Valuation
            output['trailingPE'] = self._safe_float(m.get('peBasicExclExtraTTM'))
            output['priceToBook'] = self._safe_float(m.get('pbAnnual'))
            output['beta'] = self._safe_float(m.get('beta'))

            # 52-week range
            output['fiftyTwoWeekHigh'] = self._safe_float(m.get('52WeekHigh'))
            output['fiftyTwoWeekLow'] = self._safe_float(m.get('52WeekLow'))

            # Margins (convert to decimal)
            if m.get('grossMarginTTM') is not None:
                output['grossMargins'] = m['grossMarginTTM'] / 100
            if m.get('operatingMarginTTM') is not None:
                output['operatingMargins'] = m['operatingMarginTTM'] / 100
            if m.get('netProfitMarginTTM') is not None:
                output['profitMargins'] = m['netProfitMarginTTM'] / 100

            # Returns (convert to decimal)
            if m.get('roeTTM') is not None:
                output['returnOnEquity'] = m['roeTTM'] / 100
            if m.get('roaeTTM') is not None:
                output['returnOnAssets'] = m['roaeTTM'] / 100

            # Growth (convert to decimal)
            if m.get('revenueGrowthTTMYoy') is not None:
                output['revenueGrowth'] = m['revenueGrowthTTMYoy'] / 100
            if m.get('epsGrowthTTMYoy') is not None:
                output['earningsGrowth'] = m['epsGrowthTTMYoy'] / 100

            # Financial strength
            output['currentRatio'] = self._safe_float(m.get('currentRatio'))
            output['debtToEquity'] = self._safe_float(m.get('totalDebtToEquity'))

            # Dividend
            if m.get('dividendYieldIndicatedAnnual') is not None:
                output['dividendYield'] = m['dividendYieldIndicatedAnnual'] / 100

        # Tag each field with source for quality tracking
        tagged_output = {}
        for key, value in output.items():
            if value is not None:
                tagged_output[key] = value
                if not key.startswith('_'):
                    tagged_output[f'_{key}_source'] = 'finnhub'

        logger.debug("finnhub_financial_metrics_success",
                    symbol=symbol,
                    fields_count=len(tagged_output))

        return tagged_output if tagged_output else None

    def _safe_float(self, value: Any) -> Optional[float]:
        """Convert to float, handling None gracefully."""
        try:
            if value is None:
                return None
            return float(value)
        except (ValueError, TypeError):
            return None


# Singleton instance
_finnhub_fetcher = None


def get_finnhub_fetcher() -> FinnhubFetcher:
    """Get or create singleton Finnhub fetcher."""
    global _finnhub_fetcher
    if _finnhub_fetcher is None:
        _finnhub_fetcher = FinnhubFetcher()
    return _finnhub_fetcher
