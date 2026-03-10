/**
 * Exchange client implementations.
 * 
 * This module provides clean, TypeScript-friendly wrappers around the auto-generated
 * OpenAPI client, matching the Python API exactly.
 */

import {
    DefaultApi,
    Configuration,
    FetchOHLCVRequest,
    FetchTradesRequest,
    CreateOrderRequest,
    ExchangeCredentials,
} from "../generated/src/index.js";

import {
    UnifiedMarket,
    MarketOutcome,
    MarketList,
    PriceCandle,
    OrderBook,
    OrderLevel,
    Trade,
    UserTrade,
    Order,
    Position,
    Balance,
    SearchIn,
    UnifiedEvent,
    ExecutionPriceResult,
    PaginatedMarketsResult,
    MarketFilterCriteria,
    MarketFilterFunction,
    EventFilterCriteria,
    EventFilterFunction,
} from "./models.js";

import { ServerManager } from "./server-manager.js";

// Converter functions
function convertMarket(raw: any): UnifiedMarket {
    const outcomes: MarketOutcome[] = (raw.outcomes || []).map((o: any) => ({
        outcomeId: o.outcomeId,
        marketId: o.marketId,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        metadata: o.metadata,
    }));

    const convertOutcome = (o: any) => o ? ({
        outcomeId: o.outcomeId,
        marketId: o.marketId,
        label: o.label,
        price: o.price,
        priceChange24h: o.priceChange24h,
        metadata: o.metadata,
    }) : undefined;

    return {
        marketId: raw.marketId,
        title: raw.title,
        outcomes,
        volume24h: raw.volume24h || 0,
        liquidity: raw.liquidity || 0,
        url: raw.url,
        description: raw.description,
        resolutionDate: raw.resolutionDate ? new Date(raw.resolutionDate) : undefined,
        volume: raw.volume,
        openInterest: raw.openInterest,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
        eventId: raw.eventId,
        yes: convertOutcome(raw.yes),
        no: convertOutcome(raw.no),
        up: convertOutcome(raw.up),
        down: convertOutcome(raw.down),
    };
}


function convertCandle(raw: any): PriceCandle {
    return {
        timestamp: raw.timestamp,
        open: raw.open,
        high: raw.high,
        low: raw.low,
        close: raw.close,
        volume: raw.volume,
    };
}

function convertOrderBook(raw: any): OrderBook {
    const bids: OrderLevel[] = (raw.bids || []).map((b: any) => ({
        price: b.price,
        size: b.size,
    }));

    const asks: OrderLevel[] = (raw.asks || []).map((a: any) => ({
        price: a.price,
        size: a.size,
    }));

    return {
        bids,
        asks,
        timestamp: raw.timestamp,
    };
}

function convertTrade(raw: any): Trade {
    return {
        id: raw.id,
        timestamp: raw.timestamp,
        price: raw.price,
        amount: raw.amount,
        side: raw.side || "unknown",
    };
}

function convertOrder(raw: any): Order {
    return {
        id: raw.id,
        marketId: raw.marketId,
        outcomeId: raw.outcomeId,
        side: raw.side,
        type: raw.type,
        amount: raw.amount,
        status: raw.status,
        filled: raw.filled,
        remaining: raw.remaining,
        timestamp: raw.timestamp,
        price: raw.price,
        fee: raw.fee,
    };
}

function convertPosition(raw: any): Position {
    return {
        marketId: raw.marketId,
        outcomeId: raw.outcomeId,
        outcomeLabel: raw.outcomeLabel,
        size: raw.size,
        entryPrice: raw.entryPrice,
        currentPrice: raw.currentPrice,
        unrealizedPnL: raw.unrealizedPnL,
        realizedPnL: raw.realizedPnL,
    };
}

function convertBalance(raw: any): Balance {
    return {
        currency: raw.currency,
        total: raw.total,
        available: raw.available,
        locked: raw.locked,
    };
}

function convertUserTrade(raw: any): UserTrade {
    return {
        id: raw.id,
        price: raw.price,
        amount: raw.amount,
        side: raw.side || "unknown",
        timestamp: raw.timestamp,
        orderId: raw.orderId,
        outcomeId: raw.outcomeId,
        marketId: raw.marketId,
    };
}

function convertEvent(raw: any): UnifiedEvent {
    const markets = MarketList.from((raw.markets || []).map(convertMarket)) as MarketList;

    const event: UnifiedEvent = {
        id: raw.id,
        title: raw.title,
        description: raw.description,
        slug: raw.slug,
        markets,
        url: raw.url,
        image: raw.image,
        category: raw.category,
        tags: raw.tags,
    };

    return event;
}

/**
 * Base exchange client options.
 */
export interface ExchangeOptions {
    /** API key for authentication (optional) */
    apiKey?: string;

    /** Private key for authentication (optional) */
    privateKey?: string;

    /** Base URL of the PMXT sidecar server */
    baseUrl?: string;

    /** Automatically start server if not running (default: true) */
    autoStartServer?: boolean;

    /** Optional Polymarket Proxy/Smart Wallet address */
    proxyAddress?: string;

    /** Optional signature type (0=EOA, 1=Proxy) */
    signatureType?: number;
}

/**
 * Base class for prediction market exchanges.
 * 
 * This provides a unified interface for interacting with different
 * prediction market platforms (Polymarket, Kalshi, etc.).
 */
export abstract class Exchange {
    protected exchangeName: string;
    protected apiKey?: string;
    protected privateKey?: string;
    protected proxyAddress?: string;
    protected signatureType?: number;
    protected api: DefaultApi;
    protected config: Configuration;
    protected serverManager: ServerManager;
    protected initPromise: Promise<void>;

    constructor(exchangeName: string, options: ExchangeOptions = {}) {
        this.exchangeName = exchangeName.toLowerCase();
        this.apiKey = options.apiKey;
        this.privateKey = options.privateKey;
        this.proxyAddress = options.proxyAddress;
        this.signatureType = options.signatureType;

        let baseUrl = options.baseUrl || "http://localhost:3847";
        const autoStartServer = options.autoStartServer !== false;

        // Initialize server manager
        this.serverManager = new ServerManager({ baseUrl });

        // Configure the API client with the initial base URL (will be updated if port changes)
        this.config = new Configuration({ basePath: baseUrl });
        this.api = new DefaultApi(this.config);

        // Initialize the server connection asynchronously
        this.initPromise = this.initializeServer(autoStartServer);
    }

    private async initializeServer(autoStartServer: boolean): Promise<void> {
        if (autoStartServer) {
            try {
                await this.serverManager.ensureServerRunning();

                // Get the actual port the server is running on
                // (may differ from default if default port was busy)
                const actualPort = this.serverManager.getRunningPort();
                const newBaseUrl = `http://localhost:${actualPort}`;

                const accessToken = this.serverManager.getAccessToken();
                const headers: any = {};
                if (accessToken) {
                    headers['x-pmxt-access-token'] = accessToken;
                }

                // Update API client with actual base URL
                this.config = new Configuration({
                    basePath: newBaseUrl,
                    headers
                });
                this.api = new DefaultApi(this.config);
            } catch (error) {
                throw new Error(
                    `Failed to start PMXT server: ${error}\n\n` +
                    `Please ensure 'pmxt-core' is installed: npm install -g pmxt-core\n` +
                    `Or start the server manually: pmxt-server`
                );
            }
        }
    }

    protected handleResponse(response: any): any {
        if (!response.success) {
            const error = response.error || {};
            throw new Error(error.message || "Unknown error");
        }
        return response.data;
    }

    protected getCredentials(): ExchangeCredentials | undefined {
        if (!this.apiKey && !this.privateKey) {
            return undefined;
        }
        return {
            apiKey: this.apiKey,
            privateKey: this.privateKey,
            funderAddress: this.proxyAddress,
            signatureType: this.signatureType,
        };
    }

    // Low-Level API Access

    /**
     * Call an exchange-specific REST endpoint by its operationId.
     * This provides direct access to all implicit API methods defined in
     * the exchange's OpenAPI spec (e.g., Polymarket CLOB, Kalshi trading API).
     *
     * @param operationId - The operationId (or auto-generated name) of the endpoint
     * @param params - Optional parameters to pass to the endpoint
     * @returns The raw response data from the exchange
     *
     * @example
     * ```typescript
     * // Call a Polymarket CLOB endpoint directly
     * const result = await poly.callApi('getMarket', { condition_id: '0x...' });
     * ```
     */
    async callApi(operationId: string, params?: Record<string, any>): Promise<any> {
        await this.initPromise;
        try {
            const url = `${this.config.basePath}/api/${this.exchangeName}/callApi`;

            const requestBody: any = {
                args: [operationId, params],
                credentials: this.getCredentials()
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }

            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            throw new Error(`Failed to call API '${operationId}': ${error}`);
        }
    }

    // BEGIN GENERATED METHODS

    async loadMarkets(reload: boolean = false): Promise<Record<string, UnifiedMarket>> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(reload);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/loadMarkets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            const result: Record<string, UnifiedMarket> = {};
            for (const [key, value] of Object.entries(data as any)) {
                result[key] = convertMarket(value);
            }
            return result;
        } catch (error) {
            throw new Error(`Failed to loadMarkets: ${error}`);
        }
    }

    async fetchMarkets(params?: any): Promise<UnifiedMarket[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchMarkets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertMarket);
        } catch (error) {
            throw new Error(`Failed to fetchMarkets: ${error}`);
        }
    }

    async fetchMarketsPaginated(params?: any): Promise<PaginatedMarketsResult> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchMarketsPaginated`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return {
                data: (data.data || []).map(convertMarket),
                total: data.total,
                nextCursor: data.nextCursor,
            };
        } catch (error) {
            throw new Error(`Failed to fetchMarketsPaginated: ${error}`);
        }
    }

    async fetchEvents(params?: any): Promise<UnifiedEvent[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchEvents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertEvent);
        } catch (error) {
            throw new Error(`Failed to fetchEvents: ${error}`);
        }
    }

    async fetchMarket(params?: any): Promise<UnifiedMarket> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchMarket`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertMarket(data);
        } catch (error) {
            throw new Error(`Failed to fetchMarket: ${error}`);
        }
    }

    async fetchEvent(params?: any): Promise<UnifiedEvent> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchEvent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertEvent(data);
        } catch (error) {
            throw new Error(`Failed to fetchEvent: ${error}`);
        }
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(id);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchOrderBook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrderBook(data);
        } catch (error) {
            throw new Error(`Failed to fetchOrderBook: ${error}`);
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(orderId);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/cancelOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to cancelOrder: ${error}`);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        await this.initPromise;
        try {
            const args: any[] = [];
            args.push(orderId);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchOrder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to fetchOrder: ${error}`);
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (marketId !== undefined) args.push(marketId);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchOpenOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            throw new Error(`Failed to fetchOpenOrders: ${error}`);
        }
    }

    async fetchMyTrades(params?: any): Promise<UserTrade[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchMyTrades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertUserTrade);
        } catch (error) {
            throw new Error(`Failed to fetchMyTrades: ${error}`);
        }
    }

    async fetchClosedOrders(params?: any): Promise<Order[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchClosedOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            throw new Error(`Failed to fetchClosedOrders: ${error}`);
        }
    }

    async fetchAllOrders(params?: any): Promise<Order[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            if (params !== undefined) args.push(params);
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchAllOrders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertOrder);
        } catch (error) {
            throw new Error(`Failed to fetchAllOrders: ${error}`);
        }
    }

    async fetchPositions(): Promise<Position[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchPositions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertPosition);
        } catch (error) {
            throw new Error(`Failed to fetchPositions: ${error}`);
        }
    }

    async fetchBalance(): Promise<Balance[]> {
        await this.initPromise;
        try {
            const args: any[] = [];
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/fetchBalance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            const data = this.handleResponse(json);
            return data.map(convertBalance);
        } catch (error) {
            throw new Error(`Failed to fetchBalance: ${error}`);
        }
    }

    async close(): Promise<void> {
        await this.initPromise;
        try {
            const args: any[] = [];
            const response = await fetch(`${this.config.basePath}/api/${this.exchangeName}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this.config.headers },
                body: JSON.stringify({ args, credentials: this.getCredentials() }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }
            const json = await response.json();
            this.handleResponse(json);
        } catch (error) {
            throw new Error(`Failed to close: ${error}`);
        }
    }

    // END GENERATED METHODS

    /**
     * Get historical price candles.
     *
     * @param outcomeId - Outcome ID (from market.outcomes[].outcomeId)
     * @param params - History filter parameters
     * @returns List of price candles
     * 
     * @example
     * ```typescript
     * const markets = await exchange.fetchMarkets({ query: "Trump" });
     * const outcomeId = markets[0].outcomes[0].outcomeId;
     * const candles = await exchange.fetchOHLCV(outcomeId, {
     *   resolution: "1h",
     *   limit: 100
     * });
     * ```
     */
    async fetchOHLCV(
        outcomeId: string,
        params: any
    ): Promise<PriceCandle[]> {
        await this.initPromise;
        try {
            const paramsDict: any = { resolution: params.resolution };
            if (params.start) {
                paramsDict.start = params.start.toISOString();
            }
            if (params.end) {
                paramsDict.end = params.end.toISOString();
            }
            if (params.limit) {
                paramsDict.limit = params.limit;
            }

            const requestBody: FetchOHLCVRequest = {
                args: [outcomeId, paramsDict],
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchOHLCV({
                exchange: this.exchangeName as any,
                fetchOHLCVRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertCandle);
        } catch (error) {
            throw new Error(`Failed to fetch OHLCV: ${error}`);
        }
    }

    /**
     * Get trade history for an outcome.
     *
     * Note: Polymarket requires API key.
     *
     * @param outcomeId - Outcome ID
     * @param params - History filter parameters
     * @returns List of trades
     */
    async fetchTrades(
        outcomeId: string,
        params: any
    ): Promise<Trade[]> {
        await this.initPromise;
        try {
            const paramsDict: any = { resolution: params.resolution };
            if (params.limit) {
                paramsDict.limit = params.limit;
            }

            const requestBody: FetchTradesRequest = {
                args: [outcomeId, paramsDict],
                credentials: this.getCredentials()
            };

            const response = await this.api.fetchTrades({
                exchange: this.exchangeName as any,
                fetchTradesRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertTrade);
        } catch (error) {
            throw new Error(`Failed to fetch trades: ${error}`);
        }
    }

    // WebSocket Streaming Methods

    /**
     * Watch real-time order book updates via WebSocket.
     * 
     * Returns a promise that resolves with the next order book update.
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     * 
     * @param outcomeId - Outcome ID to watch
     * @param limit - Optional depth limit for order book
     * @returns Next order book update
     * 
     * @example
     * ```typescript
     * // Stream order book updates
     * while (true) {
     *   const orderBook = await exchange.watchOrderBook(outcomeId);
     *   console.log(`Best bid: ${orderBook.bids[0].price}`);
     *   console.log(`Best ask: ${orderBook.asks[0].price}`);
     * }
     * ```
     */
    async watchOrderBook(outcomeId: string, limit?: number): Promise<OrderBook> {
        await this.initPromise;
        try {
            const args: any[] = [outcomeId];
            if (limit !== undefined) {
                args.push(limit);
            }

            const requestBody: any = {
                args,
                credentials: this.getCredentials()
            };

            const response = await this.api.watchOrderBook({
                exchange: this.exchangeName as any,
                watchOrderBookRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return convertOrderBook(data);
        } catch (error) {
            throw new Error(`Failed to watch order book: ${error}`);
        }
    }

    /**
     * Watch real-time trade updates via WebSocket.
     * 
     * Returns a promise that resolves with the next trade(s).
     * Call repeatedly in a loop to stream updates (CCXT Pro pattern).
     * 
     * @param outcomeId - Outcome ID to watch
     * @param since - Optional timestamp to filter trades from
     * @param limit - Optional limit for number of trades
     * @returns Next trade update(s)
     * 
     * @example
     * ```typescript
     * // Stream trade updates
     * while (true) {
     *   const trades = await exchange.watchTrades(outcomeId);
     *   for (const trade of trades) {
     *     console.log(`Trade: ${trade.price} @ ${trade.amount}`);
     *   }
     * }
     * ```
     */
    async watchTrades(
        outcomeId: string,
        since?: number,
        limit?: number
    ): Promise<Trade[]> {
        await this.initPromise;
        try {
            const args: any[] = [outcomeId];
            if (since !== undefined) {
                args.push(since);
            }
            if (limit !== undefined) {
                args.push(limit);
            }

            const requestBody: any = {
                args,
                credentials: this.getCredentials()
            };

            const response = await this.api.watchTrades({
                exchange: this.exchangeName as any,
                watchTradesRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return data.map(convertTrade);
        } catch (error) {
            throw new Error(`Failed to watch trades: ${error}`);
        }
    }

    // Trading Methods (require authentication)

    /**
     * Create a new order.
     * 
     * @param params - Order parameters
     * @returns Created order
     * 
     * @example
     * ```typescript
     * const order = await exchange.createOrder({
     *   marketId: "663583",
     *   outcomeId: "10991849...",
     *   side: "buy",
     *   type: "limit",
     *   amount: 10,
     *   price: 0.55
     * });
     * ```
     */
    async createOrder(params: any): Promise<Order> {
        await this.initPromise;
        try {
            // Resolve outcome shorthand: extract marketId/outcomeId from outcome object
            let marketId = params.marketId;
            let outcomeId = params.outcomeId;

            if (params.outcome) {
                if (marketId !== undefined || outcomeId !== undefined) {
                    throw new Error(
                        "Cannot specify both 'outcome' and 'marketId'/'outcomeId'. Use one or the other."
                    );
                }
                const outcome: MarketOutcome = params.outcome;
                if (!outcome.marketId) {
                    throw new Error(
                        "outcome.marketId is not set. Ensure the outcome comes from a fetched market."
                    );
                }
                marketId = outcome.marketId;
                outcomeId = outcome.outcomeId;
            }

            const paramsDict: any = {
                marketId,
                outcomeId,
                side: params.side,
                type: params.type,
                amount: params.amount,
            };
            if (params.price !== undefined) {
                paramsDict.price = params.price;
            }
            if (params.fee !== undefined) {
                paramsDict.fee = params.fee;
            }

            const requestBody: CreateOrderRequest = {
                args: [paramsDict],
                credentials: this.getCredentials()
            };

            const response = await this.api.createOrder({
                exchange: this.exchangeName as any,
                createOrderRequest: requestBody,
            });

            const data = this.handleResponse(response);
            return convertOrder(data);
        } catch (error) {
            throw new Error(`Failed to create order: ${error}`);
        }
    }

    /**
     * Calculate the average execution price for a given amount by walking the order book.
     * Uses the sidecar server for calculation to ensure consistency.
     * 
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - The amount to execute
     * @returns The volume-weighted average price, or 0 if insufficient liquidity
     */
    async getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<number> {
        const result = await this.getExecutionPriceDetailed(orderBook, side, amount);
        return result.fullyFilled ? result.price : 0;
    }

    /**
     * Calculate detailed execution price information.
     * Uses the sidecar server for calculation to ensure consistency.
     * 
     * @param orderBook - The current order book
     * @param side - 'buy' or 'sell'
     * @param amount - The amount to execute
     * @returns Detailed execution result
     */
    async getExecutionPriceDetailed(
        orderBook: OrderBook,
        side: 'buy' | 'sell',
        amount: number
    ): Promise<ExecutionPriceResult> {
        await this.initPromise;
        try {
            const body: any = {
                args: [orderBook, side, amount]
            };
            const credentials = this.getCredentials();
            if (credentials) {
                body.credentials = credentials;
            }

            const url = `${this.config.basePath}/api/${this.exchangeName}/getExecutionPriceDetailed`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...this.config.headers
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error?.message || response.statusText);
            }

            const json = await response.json();
            return this.handleResponse(json);
        } catch (error) {
            throw new Error(`Failed to get execution price: ${error}`);
        }
    }

    // ----------------------------------------------------------------------------
    // Filtering Methods
    // ----------------------------------------------------------------------------

    /**
     * Filter markets based on criteria or custom function.
     *
     * @param markets - Array of markets to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of markets
     *
     * @example Simple text search
     * api.filterMarkets(markets, 'Trump')
     *
     * @example Advanced filtering
     * api.filterMarkets(markets, {
     *   text: 'Trump',
     *   searchIn: ['title', 'tags'],
     *   volume24h: { min: 10000 },
     *   category: 'Politics',
     *   price: { outcome: 'yes', max: 0.5 }
     * })
     *
     * @example Custom predicate
     * api.filterMarkets(markets, m => m.liquidity > 5000 && m.yes?.price < 0.3)
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
            if (criteria.resolutionDate && market.resolutionDate) {
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
     * Filter events based on criteria or custom function.
     *
     * @param events - Array of events to filter
     * @param criteria - Filter criteria object, string (simple text search), or predicate function
     * @returns Filtered array of events
     *
     * @example Simple text search
     * api.filterEvents(events, 'Trump')
     *
     * @example Advanced filtering
     * api.filterEvents(events, {
     *   text: 'Election',
     *   searchIn: ['title', 'tags'],
     *   category: 'Politics',
     *   marketCount: { min: 5 }
     * })
     *
     * @example Custom predicate
     * api.filterEvents(events, e => e.markets.length > 10)
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
}

/**
 * Polymarket exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const poly = new Polymarket();
 * const markets = await poly.fetchMarkets({ query: "Trump" });
 *
 * // Trading (requires auth)
 * const poly = new Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
 * const balance = await poly.fetchBalance();
 * ```
 */
/**
 * Options for initializing Polymarket client.
 */
export interface PolymarketOptions {
    /** Private key for authentication (optional) */
    privateKey?: string;

    /** Base URL of the PMXT sidecar server */
    baseUrl?: string;

    /** Automatically start server if not running (default: true) */
    autoStartServer?: boolean;

    /** Optional Polymarket Proxy/Smart Wallet address */
    proxyAddress?: string;

    /** Optional signature type */
    signatureType?: 'eoa' | 'poly-proxy' | 'gnosis-safe' | number;
}

export class Polymarket extends Exchange {
    constructor(options: PolymarketOptions = {}) {
        // Default to gnosis-safe signature type
        const polyOptions = {
            signatureType: 'gnosis-safe',
            ...options
        };
        super("polymarket", polyOptions as ExchangeOptions);
    }
}

/**
 * Kalshi exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const kalshi = new Kalshi();
 * const markets = await kalshi.fetchMarkets({ query: "Fed rates" });
 *
 * // Trading (requires auth)
 * const kalshi = new Kalshi({
 *   apiKey: process.env.KALSHI_API_KEY,
 *   privateKey: process.env.KALSHI_PRIVATE_KEY
 * });
 * const balance = await kalshi.fetchBalance();
 * ```
 */
export class Kalshi extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("kalshi", options);
    }
}

/**
 * Limitless exchange client.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const limitless = new Limitless();
 * const markets = await limitless.fetchMarkets({ query: "Trump" });
 *
 * // Trading (requires auth)
 * const limitless = new Limitless({
 *   apiKey: process.env.LIMITLESS_API_KEY,
 *   privateKey: process.env.LIMITLESS_PRIVATE_KEY
 * });
 * const balance = await limitless.fetchBalance();
 * ```
 */
export class Limitless extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("limitless", options);
    }
}

/**
 * Kalshi Demo exchange client (paper trading / sandbox environment).
 *
 * Uses Kalshi's demo environment — same API as Kalshi but against test accounts.
 * Credentials are separate from production Kalshi credentials.
 *
 * @example
 * ```typescript
 * const kalshiDemo = new KalshiDemo({
 *   apiKey: process.env.KALSHI_DEMO_API_KEY,
 *   privateKey: process.env.KALSHI_DEMO_PRIVATE_KEY
 * });
 * const balance = await kalshiDemo.fetchBalance();
 * ```
 */
export class KalshiDemo extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("kalshi-demo", options);
    }
}

/**
 * Myriad exchange client.
 *
 * AMM-based prediction market exchange. Requires an API key for trading.
 * The `privateKey` field is used as the wallet address.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const myriad = new Myriad();
 * const markets = await myriad.fetchMarkets();
 *
 * // Trading (requires auth)
 * const myriad = new Myriad({
 *   apiKey: process.env.MYRIAD_API_KEY,
 *   privateKey: process.env.MYRIAD_WALLET_ADDRESS
 * });
 * ```
 */
export class Myriad extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("myriad", options);
    }
}

/**
 * Probable exchange client.
 *
 * BSC-based CLOB exchange. Requires all four credential fields for trading.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const probable = new Probable();
 * const markets = await probable.fetchMarkets();
 *
 * // Trading (requires auth)
 * const probable = new Probable({
 *   privateKey: process.env.PROBABLE_PRIVATE_KEY,
 *   apiKey: process.env.PROBABLE_API_KEY,
 *   apiSecret: process.env.PROBABLE_API_SECRET,
 *   passphrase: process.env.PROBABLE_PASSPHRASE
 * });
 * ```
 */
export class Probable extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("probable", options);
    }
}

/**
 * Baozi exchange client.
 *
 * Solana-based on-chain pari-mutuel betting exchange.
 * Requires a Solana private key for trading.
 *
 * @example
 * ```typescript
 * // Public data (no auth)
 * const baozi = new Baozi();
 * const markets = await baozi.fetchMarkets();
 *
 * // Trading (requires auth)
 * const baozi = new Baozi({
 *   privateKey: process.env.BAOZI_PRIVATE_KEY
 * });
 * ```
 */
export class Baozi extends Exchange {
    constructor(options: ExchangeOptions = {}) {
        super("baozi", options);
    }
}
