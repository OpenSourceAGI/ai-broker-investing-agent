import { UnifiedMarket, UnifiedEvent, PriceCandle, CandleInterval, OrderBook, Trade, UserTrade, Order, Position, Balance, CreateOrderParams } from './types';
import { getExecutionPrice, getExecutionPriceDetailed, ExecutionPriceResult } from './utils/math';
import { MarketNotFound, EventNotFound } from './errors';
import { Throttler } from './utils/throttler';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

// ----------------------------------------------------------------------------
// Implicit API Types (OpenAPI-driven method generation)
// ----------------------------------------------------------------------------

export interface ApiEndpoint {
    method: string;
    path: string;
    isPrivate?: boolean;
    operationId?: string;
}

export interface ApiDescriptor {
    baseUrl: string;
    endpoints: Record<string, ApiEndpoint>;
}

export interface ImplicitApiMethodInfo {
    name: string;
    method: string;
    path: string;
    isPrivate: boolean;
}

export interface MarketFilterParams {
    limit?: number;
    offset?: number;
    sort?: 'volume' | 'liquidity' | 'newest';
    status?: 'active' | 'inactive' | 'closed' | 'all'; // Filter by market status (default: 'active', 'inactive' and 'closed' are interchangeable)
    searchIn?: 'title' | 'description' | 'both'; // Where to search (default: 'title')
    query?: string;  // For keyword search
    slug?: string;   // For slug/ticker lookup
    marketId?: string;    // Direct lookup by market ID
    outcomeId?: string;   // Reverse lookup -- find market containing this outcome
    eventId?: string;     // Find markets belonging to an event
    page?: number;   // For pagination (used by Limitless)
    similarityThreshold?: number; // For semantic search (used by Limitless)
}

export interface MarketFetchParams extends MarketFilterParams { }

export interface EventFetchParams {
    query?: string;  // For keyword search
    limit?: number;
    offset?: number;
    sort?: 'volume' | 'liquidity' | 'newest';
    status?: 'active' | 'inactive' | 'closed' | 'all'; // Filter by event status (default: 'active', 'inactive' and 'closed' are interchangeable)
    searchIn?: 'title' | 'description' | 'both';
    eventId?: string;    // Direct lookup by event ID
    slug?: string;       // Lookup by event slug
}

export interface HistoryFilterParams {
    resolution?: CandleInterval; // Optional for backward compatibility
    start?: Date;
    end?: Date;
    limit?: number;
}

export interface OHLCVParams {
    resolution: CandleInterval; // Required for candle aggregation
    start?: Date;
    end?: Date;
    limit?: number;
}

export interface TradesParams {
    // No resolution - trades are discrete events, not aggregated
    start?: Date;
    end?: Date;
    limit?: number;
}

export interface MyTradesParams {
    outcomeId?: string;  // filter to specific outcome/ticker
    marketId?: string;   // filter to specific market
    since?: Date;
    until?: Date;
    limit?: number;
    cursor?: string;     // for Kalshi cursor pagination
}

export interface OrderHistoryParams {
    marketId?: string;   // required for Limitless (slug)
    since?: Date;
    until?: Date;
    limit?: number;
    cursor?: string;
}

// ----------------------------------------------------------------------------
// Filtering Types
// ----------------------------------------------------------------------------

export type MarketFilterCriteria = {
    // Text search
    text?: string;
    searchIn?: ('title' | 'description' | 'category' | 'tags' | 'outcomes')[]; // Default: ['title']

    // Numeric range filters
    volume24h?: { min?: number; max?: number };
    volume?: { min?: number; max?: number };
    liquidity?: { min?: number; max?: number };
    openInterest?: { min?: number; max?: number };

    // Date filters
    resolutionDate?: {
        before?: Date;
        after?: Date;
    };

    // Category/tag filters
    category?: string;
    tags?: string[]; // Match if market has ANY of these tags

    // Price filters (for binary markets)
    price?: {
        outcome: 'yes' | 'no' | 'up' | 'down';
        min?: number; // 0.0 to 1.0
        max?: number;
    };

    // Price change filters
    priceChange24h?: {
        outcome: 'yes' | 'no' | 'up' | 'down';
        min?: number; // e.g., -0.1 for 10% drop
        max?: number;
    };
};

export type MarketFilterFunction = (market: UnifiedMarket) => boolean;

export type EventFilterCriteria = {
    // Text search
    text?: string;
    searchIn?: ('title' | 'description' | 'category' | 'tags')[]; // Default: ['title']

    // Category/tag filters
    category?: string;
    tags?: string[];

    // Filter by contained markets
    marketCount?: { min?: number; max?: number };
    totalVolume?: { min?: number; max?: number }; // Sum of market volumes
};

export type EventFilterFunction = (event: UnifiedEvent) => boolean;

// ----------------------------------------------------------------------------
// Capability Map (ccxt-style exchange.has)
// ----------------------------------------------------------------------------

export type ExchangeCapability = true | false | 'emulated';

export interface ExchangeHas {
    fetchMarkets: ExchangeCapability;
    fetchEvents: ExchangeCapability;
    fetchOHLCV: ExchangeCapability;
    fetchOrderBook: ExchangeCapability;
    fetchTrades: ExchangeCapability;
    createOrder: ExchangeCapability;
    cancelOrder: ExchangeCapability;
    fetchOrder: ExchangeCapability;
    fetchOpenOrders: ExchangeCapability;
    fetchPositions: ExchangeCapability;
    fetchBalance: ExchangeCapability;
    watchOrderBook: ExchangeCapability;
    watchTrades: ExchangeCapability;
    fetchMyTrades: ExchangeCapability;
    fetchClosedOrders: ExchangeCapability;
    fetchAllOrders: ExchangeCapability;
}

export interface ExchangeCredentials {
    // Standard API authentication (Kalshi, etc.)
    apiKey?: string;
    apiSecret?: string;
    passphrase?: string;

    // Blockchain-based authentication (Polymarket)
    privateKey?: string;  // Required for Polymarket L1 auth

    // Polymarket-specific L2 fields
    signatureType?: number | string;  // 0 = EOA, 1 = Poly Proxy, 2 = Gnosis Safe (Can also use 'eoa', 'polyproxy', 'gnosis_safe')
    funderAddress?: string;  // The address funding the trades (defaults to signer address)
}

export interface ExchangeOptions {
    /**
     * How long (ms) a market snapshot created by `fetchMarketsPaginated` remains valid
     * before being discarded and re-fetched from the API on the next call.
     * Defaults to 0 (no TTL — the snapshot is re-fetched on every initial call).
     */
    snapshotTTL?: number;
}

/** Shape returned by fetchMarketsPaginated */
export interface PaginatedMarketsResult {
    data: UnifiedMarket[];
    total: number;
    nextCursor?: string;
}

// ----------------------------------------------------------------------------
// Base Exchange Class
// ----------------------------------------------------------------------------

export abstract class PredictionMarketExchange {
    [key: string]: any; // Allow dynamic method assignment for implicit API

    protected credentials?: ExchangeCredentials;
    public verbose: boolean = false;
    public http: AxiosInstance;
    public enableRateLimit: boolean = true;
    private _rateLimit: number = 1000;
    private _throttler: Throttler;

    // Snapshot state for cursor-based pagination
    private _snapshotTTL: number;
    private _snapshot?: { markets: UnifiedMarket[]; takenAt: number; id: string };

    get rateLimit(): number {
        return this._rateLimit;
    }

    set rateLimit(value: number) {
        this._rateLimit = value;
        this._throttler = new Throttler({
            refillRate: 1 / value,
            capacity: 1,
            delay: 1,
        });
    }

    // Market Cache
    public markets: Record<string, UnifiedMarket> = {};
    public marketsBySlug: Record<string, UnifiedMarket> = {};
    public loadedMarkets: boolean = false;

    // Implicit API (merged across multiple defineImplicitApi calls)
    protected apiDescriptor?: ApiDescriptor;
    private apiDescriptors: ApiDescriptor[] = [];

    readonly has: ExchangeHas = {
        fetchMarkets: false,
        fetchEvents: false,
        fetchOHLCV: false,
        fetchOrderBook: false,
        fetchTrades: false,
        createOrder: false,
        cancelOrder: false,
        fetchOrder: false,
        fetchOpenOrders: false,
        fetchPositions: false,
        fetchBalance: false,
        watchOrderBook: false,
        watchTrades: false,
        fetchMyTrades: false,
        fetchClosedOrders: false,
        fetchAllOrders: false,
    };

    constructor(credentials?: ExchangeCredentials, options?: ExchangeOptions) {
        this.credentials = credentials;
        this._snapshotTTL = options?.snapshotTTL ?? 0;
        this.http = axios.create({
            headers: {
                'User-Agent': `pmxt (https://github.com/pmxt-dev/pmxt)`
            }
        });
        this._throttler = new Throttler({
            refillRate: 1 / this._rateLimit,
            capacity: 1,
            delay: 1,
        });

        // Rate Limit Interceptor
        this.http.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
            if (this.enableRateLimit) {
                await this._throttler.throttle();
            }
            return config;
        });

        // Request Interceptor
        this.http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
            if (this.verbose) {
                console.log(`\n[pmxt] → ${config.method?.toUpperCase()} ${config.url}`);
                if (config.params) console.log('[pmxt] params:', config.params);
                if (config.data) console.log('[pmxt] body:', JSON.stringify(config.data, null, 2));
            }
            return config;
        });

        // Response Interceptor
        this.http.interceptors.response.use(
            (response: AxiosResponse) => {
                if (this.verbose) {
                    console.log(`\n[pmxt] ← ${response.status} ${response.statusText} ${response.config.url}`);
                    // console.log('[pmxt] response:', JSON.stringify(response.data, null, 2)); 
                    // Commented out full body log to avoid spam, but headers might be useful
                }
                return response;
            },
            (error: any) => {
                if (this.verbose) {
                    console.log(`\n[pmxt] ✖ REQUEST FAILED: ${error.config?.url}`);
                    console.log('[pmxt] error:', error.message);
                    if (error.response) {
                        console.log('[pmxt] status:', error.response.status);
                        console.log('[pmxt] data:', JSON.stringify(error.response.data, null, 2));
                    }
                }
                return Promise.reject(error);
            }
        );
    }

    abstract get name(): string;

    /**
     * Load and cache all markets from the exchange into `this.markets` and `this.marketsBySlug`.
     * Subsequent calls return the cached result without hitting the API again.
     *
     * This is the correct way to paginate or iterate over markets without drift.
     * Because `fetchMarkets()` always hits the API, repeated calls with different `offset`
     * values may return inconsistent results if the exchange reorders or adds markets between
     * requests. Use `loadMarkets()` once to get a stable snapshot, then paginate over
     * `Object.values(exchange.markets)` locally.
     *
     * @param reload - Force a fresh fetch from the API even if markets are already loaded
     * @returns Dictionary of markets indexed by marketId
     *
     * @example-ts Stable pagination
     * await exchange.loadMarkets();
     * const all = Object.values(exchange.markets);
     * const page1 = all.slice(0, 100);
     * const page2 = all.slice(100, 200);
     *
     * @example-python Stable pagination
     * exchange.load_markets()
     * all = list(exchange.markets.values())
     * page1 = all[:100]
     * page2 = all[100:200]
     */
    async loadMarkets(reload: boolean = false): Promise<Record<string, UnifiedMarket>> {
        if (this.loadedMarkets && !reload) {
            return this.markets;
        }

        // Fetch all markets (implementation dependent, usually fetches active markets)
        const markets = await this.fetchMarkets();

        // Reset caches
        this.markets = {};
        this.marketsBySlug = {};

        for (const market of markets) {
            this.markets[market.marketId] = market;
            // Some exchanges provide slugs, if so cache them
            if (market.slug) {
                this.marketsBySlug[market.slug] = market;
            }
        }

        this.loadedMarkets = true;
        return this.markets;
    }

    /**
     * Fetch markets with optional filtering, search, or slug lookup.
     * Always hits the exchange API — results reflect the live state at the time of the call.
     *
     * @param params - Optional parameters for filtering and search
     * @param params.query - Search keyword to filter markets
     * @param params.slug - Market slug/ticker for direct lookup
     * @param params.limit - Maximum number of results
     * @param params.offset - Pagination offset
     * @param params.sort - Sort order ('volume' | 'liquidity' | 'newest')
     * @param params.searchIn - Where to search ('title' | 'description' | 'both')
     * @returns Array of unified markets
     *
     * @note Calling this repeatedly with different `offset` values does not guarantee stable
     * ordering — exchanges may reorder or add markets between requests. For stable iteration
     * across pages, use `loadMarkets()` and paginate over `Object.values(exchange.markets)`.
     *
     * @note Some exchanges (like Limitless) may only support status 'active' for search results.
     *
     * @example-ts Fetch markets
     * const markets = await exchange.fetchMarkets({ query: 'Trump', limit: 10000 });
     * console.log(markets[0].title);
     *
     * @example-ts Get market by slug
     * const markets = await exchange.fetchMarkets({ slug: 'will-trump-win' });
     *
     * @example-python Fetch markets
     * markets = exchange.fetch_markets(query='Trump', limit=10000)
     * print(markets[0].title)
     *
     * @example-python Get market by slug
     * markets = exchange.fetch_markets(slug='will-trump-win')
     */
    async fetchMarkets(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        return this.fetchMarketsImpl(params);
    }

    /**
     * Fetch markets with cursor-based pagination backed by a stable in-memory snapshot.
     *
     * On the first call (or when no cursor is supplied), fetches all markets once and
     * caches them. Subsequent calls with a cursor returned from a previous call slice
     * directly from the cached snapshot — no additional API calls are made.
     *
     * The snapshot is invalidated after `snapshotTTL` ms (configured via `ExchangeOptions`
     * in the constructor). A request using a cursor from an expired snapshot throws
     * `'Cursor has expired'`.
     *
     * @param params.limit      - Page size (default: return all markets)
     * @param params.cursor     - Opaque cursor returned by a previous call
     * @returns PaginatedMarketsResult with data, total, and optional nextCursor
     */
    async fetchMarketsPaginated(params?: { limit?: number; cursor?: string }): Promise<PaginatedMarketsResult> {
        const limit = params?.limit;
        const cursor = params?.cursor;

        if (cursor) {
            // Cursor encodes: snapshotId:offset
            const sep = cursor.indexOf(':');
            const snapshotId = cursor.substring(0, sep);
            const offset = parseInt(cursor.substring(sep + 1), 10);

            if (
                !this._snapshot ||
                this._snapshot.id !== snapshotId ||
                (this._snapshotTTL > 0 && Date.now() - this._snapshot.takenAt > this._snapshotTTL)
            ) {
                throw new Error('Cursor has expired');
            }

            const markets = this._snapshot.markets;
            const slice = limit !== undefined ? markets.slice(offset, offset + limit) : markets.slice(offset);
            const nextOffset = offset + slice.length;
            const nextCursor = nextOffset < markets.length ? `${snapshotId}:${nextOffset}` : undefined;

            return { data: slice, total: markets.length, nextCursor };
        }

        // No cursor — (re)fetch snapshot
        if (
            !this._snapshot ||
            this._snapshotTTL === 0 ||
            Date.now() - this._snapshot.takenAt > this._snapshotTTL
        ) {
            const markets = await this.fetchMarketsImpl();
            this._snapshot = {
                markets,
                takenAt: Date.now(),
                id: Math.random().toString(36).slice(2),
            };
        }

        const markets = this._snapshot.markets;
        if (!limit) {
            return { data: markets, total: markets.length, nextCursor: undefined };
        }

        const slice = markets.slice(0, limit);
        const nextCursor = limit < markets.length ? `${this._snapshot.id}:${limit}` : undefined;
        return { data: slice, total: markets.length, nextCursor };
    }

    /**
     * Fetch events with optional keyword search.
     * Events group related markets together (e.g., "Who will be Fed Chair?" contains multiple candidate markets).
     *
     * @param params - Optional parameters for search and filtering
     * @param params.query - Search keyword to filter events. If omitted, returns top events by volume.
     * @param params.limit - Maximum number of results
     * @param params.offset - Pagination offset
     * @param params.searchIn - Where to search ('title' | 'description' | 'both')
     * @returns Array of unified events
     *
     * @note Some exchanges (like Limitless) may only support status 'active' for search results.
     *
     * @example-ts Search events
     * const events = await exchange.fetchEvents({ query: 'Fed Chair' });
     * const fedEvent = events[0];
     * console.log(fedEvent.title, fedEvent.markets.length, 'markets');
     *
     * @example-python Search events
     * events = exchange.fetch_events(query='Fed Chair')
     * fed_event = events[0]
     * print(fed_event.title, len(fed_event.markets), 'markets')
     */
    async fetchEvents(params?: EventFetchParams): Promise<UnifiedEvent[]> {
        return this.fetchEventsImpl(params ?? {});
    }

    /**
     * Fetch a single market by lookup parameters.
     * Convenience wrapper around fetchMarkets() that returns a single result or throws MarketNotFound.
     *
     * @param params - Lookup parameters (marketId, outcomeId, slug, etc.)
     * @returns A single unified market
     * @throws MarketNotFound if no market matches the parameters
     *
     * @example-ts Fetch by market ID
     * const market = await exchange.fetchMarket({ marketId: '663583' });
     *
     * @example-ts Fetch by outcome ID
     * const market = await exchange.fetchMarket({ outcomeId: '10991849...' });
     *
     * @example-python Fetch by market ID
     * market = exchange.fetch_market(market_id='663583')
     */
    async fetchMarket(params?: MarketFetchParams): Promise<UnifiedMarket> {
        // Try to fetch from cache first if we have loaded markets and have an ID/slug
        if (this.loadedMarkets) {
            if (params?.marketId && this.markets[params.marketId]) {
                return this.markets[params.marketId];
            }
            if (params?.slug && this.marketsBySlug[params.slug]) {
                return this.marketsBySlug[params.slug];
            }
        }

        const markets = await this.fetchMarkets(params);
        if (markets.length === 0) {
            const identifier = params?.marketId || params?.outcomeId || params?.slug || params?.eventId || params?.query || 'unknown';
            throw new MarketNotFound(identifier, this.name);
        }
        return markets[0];
    }

    /**
     * Fetch a single event by lookup parameters.
     * Convenience wrapper around fetchEvents() that returns a single result or throws EventNotFound.
     *
     * @param params - Lookup parameters (eventId, slug, query)
     * @returns A single unified event
     * @throws EventNotFound if no event matches the parameters
     *
     * @example-ts Fetch by event ID
     * const event = await exchange.fetchEvent({ eventId: 'TRUMP25DEC' });
     *
     * @example-python Fetch by event ID
     * event = exchange.fetch_event(event_id='TRUMP25DEC')
     */
    async fetchEvent(params?: EventFetchParams): Promise<UnifiedEvent> {
        const events = await this.fetchEvents(params);
        if (events.length === 0) {
            const identifier = params?.eventId || params?.slug || params?.query || 'unknown';
            throw new EventNotFound(identifier, this.name);
        }
        return events[0];
    }

    // ----------------------------------------------------------------------------
    // Implementation methods (to be overridden by exchanges)
    // ----------------------------------------------------------------------------

    /**
     * @internal
     * Implementation for fetching/searching markets.
     * Exchanges should handle query, slug, and plain fetch cases based on params.
     */
    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        throw new Error("Method fetchMarketsImpl not implemented.");
    }

    /**
     * @internal
     * Implementation for searching events by keyword.
     */
    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        throw new Error("Method fetchEventsImpl not implemented.");
    }

    /**
     * Fetch historical OHLCV (candlestick) price data for a specific market outcome.
     *
     * @param id - The Outcome ID (outcomeId). Use outcome.outcomeId, NOT market.marketId
     * @param params - OHLCV parameters including resolution (required)
     * @returns Array of price candles
     *
     * @example-ts Fetch hourly candles
     * const markets = await exchange.fetchMarkets({ query: 'Trump' });
     * const outcomeId = markets[0].yes.outcomeId;
     * const candles = await exchange.fetchOHLCV(outcomeId, {
     *   resolution: '1h',
     *   limit: 100
     * });
     * console.log(`Latest close: ${candles[candles.length - 1].close}`);
     *
     * @example-python Fetch hourly candles
     * markets = exchange.fetch_markets(query='Trump')
     * outcome_id = markets[0].yes.outcome_id
     * candles = exchange.fetch_ohlcv(outcome_id, resolution='1h', limit=100)
     * print(f"Latest close: {candles[-1].close}")
     *
     * @notes **CRITICAL**: Use `outcome.outcomeId` (TS) / `outcome.outcome_id` (Python), not the market ID.
     * @notes Polymarket: outcomeId is the CLOB Token ID. Kalshi: outcomeId is the Market Ticker.
     * @notes Resolution options: '1m' | '5m' | '15m' | '1h' | '6h' | '1d'
     */
    async fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams): Promise<PriceCandle[]> {
        throw new Error("Method fetchOHLCV not implemented.");
    }

    /**
     * Fetch the current order book (bids/asks) for a specific outcome.
     * Essential for calculating spread, depth, and execution prices.
     *
     * @param id - The Outcome ID (outcomeId)
     * @returns Current order book with bids and asks
     *
     * @example-ts Fetch order book
     * const book = await exchange.fetchOrderBook(outcome.outcomeId);
     * console.log(`Best bid: ${book.bids[0].price}`);
     * console.log(`Best ask: ${book.asks[0].price}`);
     * console.log(`Spread: ${(book.asks[0].price - book.bids[0].price) * 100}%`);
     *
     * @example-python Fetch order book
     * book = exchange.fetch_order_book(outcome.outcome_id)
     * print(f"Best bid: {book.bids[0].price}")
     * print(f"Best ask: {book.asks[0].price}")
     * print(f"Spread: {(book.asks[0].price - book.bids[0].price) * 100:.2f}%")
     */
    async fetchOrderBook(id: string): Promise<OrderBook> {
        throw new Error("Method fetchOrderBook not implemented.");
    }

    /**
     * Fetch raw trade history for a specific outcome.
     *
     * @param id - The Outcome ID (outcomeId)
     * @param params - Trade filter parameters
     * @returns Array of recent trades
     *
     * @example-ts Fetch recent trades
     * const trades = await exchange.fetchTrades(outcome.outcomeId, { limit: 100 });
     * for (const trade of trades) {
     *   console.log(`${trade.side} ${trade.amount} @ ${trade.price}`);
     * }
     *
     * @example-python Fetch recent trades
     * trades = exchange.fetch_trades(outcome.outcome_id, limit=100)
     * for trade in trades:
     *     print(f"{trade.side} {trade.amount} @ {trade.price}")
     *
     * @notes Polymarket requires an API key for trade history. Use fetchOHLCV for public historical data.
     */
    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        // Deprecation warning for resolution parameter
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.'
            );
        }
        throw new Error("Method fetchTrades not implemented.");
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    /**
     * Place a new order on the exchange.
     *
     * @param params - Order parameters
     * @returns The created order
     *
     * @example-ts Place a limit order
     * const order = await exchange.createOrder({
     *   marketId: market.marketId,
     *   outcomeId: market.yes.outcomeId,
     *   side: 'buy',
     *   type: 'limit',
     *   amount: 10,
     *   price: 0.55
     * });
     * console.log(`Order ${order.id}: ${order.status}`);
     *
     * @example-ts Place a market order
     * const order = await exchange.createOrder({
     *   marketId: market.marketId,
     *   outcomeId: market.yes.outcomeId,
     *   side: 'buy',
     *   type: 'market',
     *   amount: 5
     * });
     *
     * @example-python Place a limit order
     * order = exchange.create_order(
     *     market_id=market.market_id,
     *     outcome_id=market.yes.outcome_id,
     *     side='buy',
     *     type='limit',
     *     amount=10,
     *     price=0.55
     * )
     * print(f"Order {order.id}: {order.status}")
     *
     * @example-python Place a market order
     * order = exchange.create_order(
     *     market_id=market.market_id,
     *     outcome_id=market.yes.outcome_id,
     *     side='buy',
     *     type='market',
     *     amount=5
     * )
     */
    async createOrder(params: CreateOrderParams): Promise<Order> {
        throw new Error("Method createOrder not implemented.");
    }

    /**
     * Cancel an existing open order.
     *
     * @param orderId - The order ID to cancel
     * @returns The cancelled order
     *
     * @example-ts Cancel an order
     * const cancelled = await exchange.cancelOrder('order-123');
     * console.log(cancelled.status); // 'cancelled'
     *
     * @example-python Cancel an order
     * cancelled = exchange.cancel_order('order-123')
     * print(cancelled.status)  # 'cancelled'
     */
    async cancelOrder(orderId: string): Promise<Order> {
        throw new Error("Method cancelOrder not implemented.");
    }

    /**
     * Fetch a specific order by ID.
     *
     * @param orderId - The order ID to look up
     * @returns The order details
     *
     * @example-ts Fetch order status
     * const order = await exchange.fetchOrder('order-456');
     * console.log(`Filled: ${order.filled}/${order.amount}`);
     *
     * @example-python Fetch order status
     * order = exchange.fetch_order('order-456')
     * print(f"Filled: {order.filled}/{order.amount}")
     */
    async fetchOrder(orderId: string): Promise<Order> {
        throw new Error("Method fetchOrder not implemented.");
    }

    /**
     * Fetch all open orders, optionally filtered by market.
     *
     * @param marketId - Optional market ID to filter by
     * @returns Array of open orders
     *
     * @example-ts Fetch all open orders
     * const orders = await exchange.fetchOpenOrders();
     * for (const order of orders) {
     *   console.log(`${order.side} ${order.amount} @ ${order.price}`);
     * }
     *
     * @example-ts Fetch orders for a specific market
     * const orders = await exchange.fetchOpenOrders('FED-25JAN');
     *
     * @example-python Fetch all open orders
     * orders = exchange.fetch_open_orders()
     * for order in orders:
     *     print(f"{order.side} {order.amount} @ {order.price}")
     *
     * @example-python Fetch orders for a specific market
     * orders = exchange.fetch_open_orders('FED-25JAN')
     */
    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        throw new Error("Method fetchOpenOrders not implemented.");
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        throw new Error("Method fetchMyTrades not implemented.");
    }

    async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]> {
        throw new Error("Method fetchClosedOrders not implemented.");
    }

    async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]> {
        throw new Error("Method fetchAllOrders not implemented.");
    }

    /**
     * Fetch current user positions across all markets.
     *
     * @returns Array of user positions
     *
     * @example-ts Fetch positions
     * const positions = await exchange.fetchPositions();
     * for (const pos of positions) {
     *   console.log(`${pos.outcomeLabel}: ${pos.size} @ $${pos.entryPrice}`);
     *   console.log(`Unrealized P&L: $${pos.unrealizedPnL.toFixed(2)}`);
     * }
     *
     * @example-python Fetch positions
     * positions = exchange.fetch_positions()
     * for pos in positions:
     *     print(f"{pos.outcome_label}: {pos.size} @ ${pos.entry_price}")
     *     print(f"Unrealized P&L: ${pos.unrealized_pnl:.2f}")
     */
    async fetchPositions(): Promise<Position[]> {
        throw new Error("Method fetchPositions not implemented.");
    }

    /**
     * Fetch account balances.
     *
     * @returns Array of account balances
     *
     * @example-ts Fetch balance
     * const balances = await exchange.fetchBalance();
     * console.log(`Available: $${balances[0].available}`);
     *
     * @example-python Fetch balance
     * balances = exchange.fetch_balance()
     * print(f"Available: ${balances[0].available}")
     */
    async fetchBalance(): Promise<Balance[]> {
        throw new Error("Method fetchBalance not implemented.");
    }

    /**
     * Calculate the volume-weighted average execution price for a given order size.
     * Returns 0 if the order cannot be fully filled.
     *
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - Number of contracts to simulate
     * @returns Average execution price, or 0 if insufficient liquidity
     *
     * @example-ts Get execution price
     * const book = await exchange.fetchOrderBook(outcome.outcomeId);
     * const price = exchange.getExecutionPrice(book, 'buy', 100);
     * console.log(`Avg price for 100 contracts: ${price}`);
     *
     * @example-python Get execution price
     * book = exchange.fetch_order_book(outcome.outcome_id)
     * price = exchange.get_execution_price(book, 'buy', 100)
     * print(f"Avg price for 100 contracts: {price}")
     */
    getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): number {
        return getExecutionPrice(orderBook, side, amount);
    }

    /**
     * Calculate detailed execution price information including partial fill data.
     *
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - Number of contracts to simulate
     * @returns Detailed execution result with price, filled amount, and fill status
     *
     * @example-ts Get detailed execution price
     * const book = await exchange.fetchOrderBook(outcome.outcomeId);
     * const result = exchange.getExecutionPriceDetailed(book, 'buy', 100);
     * console.log(`Price: ${result.price}`);
     * console.log(`Filled: ${result.filledAmount}/${100}`);
     * console.log(`Fully filled: ${result.fullyFilled}`);
     *
     * @example-python Get detailed execution price
     * book = exchange.fetch_order_book(outcome.outcome_id)
     * result = exchange.get_execution_price_detailed(book, 'buy', 100)
     * print(f"Price: {result.price}")
     * print(f"Filled: {result.filled_amount}/100")
     * print(f"Fully filled: {result.fully_filled}")
     */
    getExecutionPriceDetailed(
        orderBook: OrderBook,
        side: 'buy' | 'sell',
        amount: number
    ): ExecutionPriceResult {
        return getExecutionPriceDetailed(orderBook, side, amount);
    }

    // ----------------------------------------------------------------------------
    // Filtering Methods
    // ----------------------------------------------------------------------------

    /**
     * Filter a list of markets by criteria.
     * Can filter by string query, structured criteria object, or custom filter function.
     *
     * @param markets - Array of markets to filter
     * @param criteria - Filter criteria: string (text search), object (structured), or function (predicate)
     * @returns Filtered array of markets
     *
     * @example-ts Simple text search
     * const filtered = exchange.filterMarkets(markets, 'Trump');
     *
     * @example-ts Advanced criteria
     * const undervalued = exchange.filterMarkets(markets, {
     *   text: 'Election',
     *   volume24h: { min: 10000 },
     *   price: { outcome: 'yes', max: 0.4 }
     * });
     *
     * @example-ts Custom predicate
     * const volatile = exchange.filterMarkets(markets,
     *   m => m.yes?.priceChange24h < -0.1
     * );
     *
     * @example-python Simple text search
     * filtered = exchange.filter_markets(markets, 'Trump')
     *
     * @example-python Advanced criteria
     * undervalued = exchange.filter_markets(markets, {
     *     'text': 'Election',
     *     'volume_24h': {'min': 10000},
     *     'price': {'outcome': 'yes', 'max': 0.4}
     * })
     *
     * @example-python Custom predicate
     * volatile = exchange.filter_markets(markets,
     *     lambda m: m.yes and m.yes.price_change_24h < -0.1
     * )
     */
    filterMarkets(
        markets: UnifiedMarket[],
        criteria: string | MarketFilterCriteria | MarketFilterFunction
    ): UnifiedMarket[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return markets.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return markets.filter(m =>
                m.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return markets.filter(market => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && market.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && market.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && market.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && market.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'outcomes' && market.outcomes?.some(o => o.label.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && market.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    market.tags?.some(marketTag =>
                        marketTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Volume24h filter
            if (criteria.volume24h) {
                if (criteria.volume24h.min !== undefined && market.volume24h < criteria.volume24h.min) {
                    return false;
                }
                if (criteria.volume24h.max !== undefined && market.volume24h > criteria.volume24h.max) {
                    return false;
                }
            }

            // Volume filter
            if (criteria.volume) {
                if (criteria.volume.min !== undefined && (market.volume || 0) < criteria.volume.min) {
                    return false;
                }
                if (criteria.volume.max !== undefined && (market.volume || 0) > criteria.volume.max) {
                    return false;
                }
            }

            // Liquidity filter
            if (criteria.liquidity) {
                if (criteria.liquidity.min !== undefined && market.liquidity < criteria.liquidity.min) {
                    return false;
                }
                if (criteria.liquidity.max !== undefined && market.liquidity > criteria.liquidity.max) {
                    return false;
                }
            }

            // OpenInterest filter
            if (criteria.openInterest) {
                if (criteria.openInterest.min !== undefined && (market.openInterest || 0) < criteria.openInterest.min) {
                    return false;
                }
                if (criteria.openInterest.max !== undefined && (market.openInterest || 0) > criteria.openInterest.max) {
                    return false;
                }
            }

            // ResolutionDate filter
            if (criteria.resolutionDate) {
                const resDate = market.resolutionDate;
                if (criteria.resolutionDate.before && resDate >= criteria.resolutionDate.before) {
                    return false;
                }
                if (criteria.resolutionDate.after && resDate <= criteria.resolutionDate.after) {
                    return false;
                }
            }

            // Price filter (for binary markets)
            if (criteria.price) {
                const outcome = market[criteria.price.outcome];
                if (!outcome) return false;

                if (criteria.price.min !== undefined && outcome.price < criteria.price.min) {
                    return false;
                }
                if (criteria.price.max !== undefined && outcome.price > criteria.price.max) {
                    return false;
                }
            }

            // Price change filter
            if (criteria.priceChange24h) {
                const outcome = market[criteria.priceChange24h.outcome];
                if (!outcome || outcome.priceChange24h === undefined) return false;

                if (criteria.priceChange24h.min !== undefined && outcome.priceChange24h < criteria.priceChange24h.min) {
                    return false;
                }
                if (criteria.priceChange24h.max !== undefined && outcome.priceChange24h > criteria.priceChange24h.max) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Filter a list of events by criteria.
     * Can filter by string query, structured criteria object, or custom filter function.
     *
     * @param events - Array of events to filter
     * @param criteria - Filter criteria: string (text search), object (structured), or function (predicate)
     * @returns Filtered array of events
     *
     * @example-ts Filter by category
     * const filtered = exchange.filterEvents(events, {
     *   category: 'Politics',
     *   marketCount: { min: 5 }
     * });
     *
     * @example-python Filter by category
     * filtered = exchange.filter_events(events, {
     *     'category': 'Politics',
     *     'market_count': {'min': 5}
     * })
     */
    filterEvents(
        events: UnifiedEvent[],
        criteria: string | EventFilterCriteria | EventFilterFunction
    ): UnifiedEvent[] {
        // Handle predicate function
        if (typeof criteria === 'function') {
            return events.filter(criteria);
        }

        // Handle simple string search
        if (typeof criteria === 'string') {
            const lowerQuery = criteria.toLowerCase();
            return events.filter(e =>
                e.title.toLowerCase().includes(lowerQuery)
            );
        }

        // Handle criteria object
        return events.filter(event => {
            // Text search
            if (criteria.text) {
                const lowerQuery = criteria.text.toLowerCase();
                const searchIn = criteria.searchIn || ['title'];
                let textMatch = false;

                for (const field of searchIn) {
                    if (field === 'title' && event.title?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'description' && event.description?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'category' && event.category?.toLowerCase().includes(lowerQuery)) {
                        textMatch = true;
                        break;
                    }
                    if (field === 'tags' && event.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))) {
                        textMatch = true;
                        break;
                    }
                }

                if (!textMatch) return false;
            }

            // Category filter
            if (criteria.category && event.category !== criteria.category) {
                return false;
            }

            // Tags filter (match ANY of the provided tags)
            if (criteria.tags && criteria.tags.length > 0) {
                const hasMatchingTag = criteria.tags.some(tag =>
                    event.tags?.some(eventTag =>
                        eventTag.toLowerCase() === tag.toLowerCase()
                    )
                );
                if (!hasMatchingTag) return false;
            }

            // Market count filter
            if (criteria.marketCount) {
                const count = event.markets.length;
                if (criteria.marketCount.min !== undefined && count < criteria.marketCount.min) {
                    return false;
                }
                if (criteria.marketCount.max !== undefined && count > criteria.marketCount.max) {
                    return false;
                }
            }

            // Total volume filter
            if (criteria.totalVolume) {
                const totalVolume = event.markets.reduce((sum, m) => sum + m.volume24h, 0);
                if (criteria.totalVolume.min !== undefined && totalVolume < criteria.totalVolume.min) {
                    return false;
                }
                if (criteria.totalVolume.max !== undefined && totalVolume > criteria.totalVolume.max) {
                    return false;
                }
            }

            return true;
        });
    }

    // ----------------------------------------------------------------------------
    // WebSocket Streaming Methods
    // ----------------------------------------------------------------------------

    /**
     * Watch order book updates in real-time via WebSocket.
     * Returns a promise that resolves with the next order book update. Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param id - The Outcome ID to watch
     * @param limit - Optional limit for orderbook depth
     * @returns Promise that resolves with the current orderbook state
     *
     * @example-ts Stream order book
     * while (true) {
     *   const book = await exchange.watchOrderBook(outcome.outcomeId);
     *   console.log(`Bid: ${book.bids[0]?.price} Ask: ${book.asks[0]?.price}`);
     * }
     *
     * @example-python Stream order book
     * while True:
     *     book = exchange.watch_order_book(outcome.outcome_id)
     *     print(f"Bid: {book.bids[0].price} Ask: {book.asks[0].price}")
     */
    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        throw new Error(`watchOrderBook() is not supported by ${this.name}`);
    }

    /**
     * Watch trade executions in real-time via WebSocket.
     * Returns a promise that resolves with the next trade(s). Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     *
     * @param id - The Outcome ID to watch
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Promise that resolves with recent trades
     *
     * @example-ts Stream trades
     * while (true) {
     *   const trades = await exchange.watchTrades(outcome.outcomeId);
     *   for (const trade of trades) {
     *     console.log(`${trade.side} ${trade.amount} @ ${trade.price}`);
     *   }
     * }
     *
     * @example-python Stream trades
     * while True:
     *     trades = exchange.watch_trades(outcome.outcome_id)
     *     for trade in trades:
     *         print(f"{trade.side} {trade.amount} @ {trade.price}")
     */
    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        throw new Error(`watchTrades() is not supported by ${this.name}`);
    }

    /**
     * Close all WebSocket connections and clean up resources.
     * Call this when you're done streaming to properly release connections.
     *
     * @example-ts Close connections
     * await exchange.close();
     *
     * @example-python Close connections
     * exchange.close()
     */
    async close(): Promise<void> {
        // Default implementation: no-op
        // Exchanges with WebSocket support should override this
    }

    // ----------------------------------------------------------------------------
    // Implicit API (OpenAPI-driven method generation)
    // ----------------------------------------------------------------------------

    /**
     * Call an implicit API method by its operationId (or auto-generated name).
     * Provides a typed entry point so unified methods can delegate to the implicit API
     * without casting to `any` everywhere.
     */
    protected async callApi(operationId: string, params?: Record<string, any>): Promise<any> {
        const method = (this as any)[operationId];
        if (typeof method !== 'function') {
            throw new Error(`Implicit API method "${operationId}" not found on ${this.name}`);
        }
        return method.call(this, params);
    }

    /**
     * Parse an API descriptor and generate callable methods on this instance.
     * Existing methods (unified API) are never overwritten.
     */
    protected defineImplicitApi(descriptor: ApiDescriptor): void {
        this.apiDescriptors.push(descriptor);

        // Merge into a single apiDescriptor for the implicitApi getter
        if (!this.apiDescriptor) {
            this.apiDescriptor = { baseUrl: descriptor.baseUrl, endpoints: { ...descriptor.endpoints } };
        } else {
            Object.assign(this.apiDescriptor.endpoints, descriptor.endpoints);
        }

        for (const [name, endpoint] of Object.entries(descriptor.endpoints)) {
            // Never overwrite existing methods (unified API wins)
            if (name in this) {
                continue;
            }
            (this as any)[name] = this.createImplicitMethod(name, endpoint, descriptor.baseUrl);
        }
    }

    /**
     * Creates an async function for an implicit API endpoint.
     */
    private createImplicitMethod(
        name: string,
        endpoint: ApiEndpoint,
        baseUrl: string
    ): (params?: Record<string, any>) => Promise<any> {
        return async (params?: Record<string, any>): Promise<any> => {
            const allParams = { ...(params || {}) };

            // Substitute path parameters like {ticker} from params
            let resolvedPath = endpoint.path.replace(/\{([^}]+)\}/g, (_match, key) => {
                const value = allParams[key];
                if (value === undefined) {
                    throw new Error(
                        `Missing required path parameter "${key}" for ${name}(). ` +
                        `Path: ${endpoint.path}`
                    );
                }
                delete allParams[key];
                return encodeURIComponent(String(value));
            });

            // Get auth headers for private endpoints
            let headers: Record<string, string> = {};
            if (endpoint.isPrivate) {
                headers = this.sign(endpoint.method, resolvedPath, allParams);
            }

            const url = `${baseUrl}${resolvedPath}`;
            const method = endpoint.method.toUpperCase();

            try {
                let response;
                if (method === 'GET' || method === 'DELETE') {
                    // Remaining params go to query string
                    response = await this.http.request({
                        method: method as any,
                        url,
                        params: Object.keys(allParams).length > 0 ? allParams : undefined,
                        headers,
                    });
                } else {
                    // POST/PUT/PATCH: remaining params go to JSON body
                    response = await this.http.request({
                        method: method as any,
                        url,
                        data: Object.keys(allParams).length > 0 ? allParams : undefined,
                        headers: { 'Content-Type': 'application/json', ...headers },
                    });
                }

                return response.data;
            } catch (error: any) {
                throw this.mapImplicitApiError(error);
            }
        };
    }

    /**
     * Returns auth headers for a private API call.
     * Exchanges should override this to provide authentication.
     */
    protected sign(_method: string, _path: string, _params: Record<string, any>): Record<string, string> {
        return {};
    }

    /**
     * Maps errors from implicit API calls through the exchange's error mapper.
     * Exchanges should override this to use their specific error mapper.
     */
    protected mapImplicitApiError(error: any): any {
        throw error;
    }

    /**
     * Introspection getter: returns info about all implicit API methods.
     */
    get implicitApi(): ImplicitApiMethodInfo[] {
        if (!this.apiDescriptor) return [];

        return Object.entries(this.apiDescriptor.endpoints).map(([name, endpoint]) => ({
            name,
            method: endpoint.method,
            path: endpoint.path,
            isPrivate: !!endpoint.isPrivate,
        }));
    }
}
