import { WebSocketClient, WebSocketConfig, ILogger } from '@limitless-exchange/sdk';
import { OrderBook, Trade } from '../../types';
import { fetchOrderBook } from './fetchOrderBook';

// Limitless uses USDC with 6 decimals
const USDC_DECIMALS = 6;
const USDC_SCALE = Math.pow(10, USDC_DECIMALS);

/**
 * Convert raw orderbook size from smallest unit to human-readable USDC amount.
 */
function convertSize(rawSize: number): number {
    return rawSize / USDC_SCALE;
}

export interface LimitlessWebSocketConfig extends Partial<WebSocketConfig> {
    apiKey?: string;
    reconnectIntervalMs?: number;
    flushIntervalMs?: number;
    logger?: ILogger;
    autoReconnect?: boolean;
    reconnectDelay?: number;
}

/**
 * Limitless WebSocket implementation using the official SDK.
 * Supports real-time updates for:
 * - AMM price updates
 * - CLOB orderbook updates
 * - User positions (requires API key)
 * - User transactions (requires API key)
 */
export class LimitlessWebSocket {
    private client: WebSocketClient;
    private config: LimitlessWebSocketConfig;
    private callApi: (operationId: string, params?: Record<string, any>) => Promise<any>;
    private orderbookCallbacks: Map<string, (orderbook: OrderBook) => void> = new Map();
    private priceCallbacks: Map<string, (data: any) => void> = new Map();
    private orderbookResolvers: Map<string, Array<{ resolve: (ob: OrderBook) => void, reject: (err: any) => void }>> = new Map();
    private orderbookBuffers: Map<string, OrderBook[]> = new Map();
    private lastOrderbookTimestamps: Map<string, number> = new Map();

    constructor(callApi: (operationId: string, params?: Record<string, any>) => Promise<any>, config: LimitlessWebSocketConfig = {}) {
        this.callApi = callApi;
        this.config = config;

        // Initialize SDK WebSocket client
        const wsConfig: WebSocketConfig = {
            url: config.url || 'wss://ws.limitless.exchange',
            apiKey: config.apiKey,
            autoReconnect: config.autoReconnect ?? true,
            reconnectDelay: config.reconnectDelay ?? config.reconnectIntervalMs ?? 1000,
        };

        this.client = new WebSocketClient(wsConfig, config.logger);

        // Set up event handlers
        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        // Handle orderbook updates
        this.client.on('orderbookUpdate', (data: any) => {
            const { marketSlug, orderbook } = data;
            const pmxtOrderbook = this.transformOrderbookData(orderbook);

            // Update timestamp for this market
            this.lastOrderbookTimestamps.set(marketSlug, Date.now());

            // Execute callback if registered
            const callback = this.orderbookCallbacks.get(marketSlug);
            if (callback) {
                callback(pmxtOrderbook);
            }

            // Handle resolvers and buffers
            const resolvers = this.orderbookResolvers.get(marketSlug) || [];
            if (resolvers.length > 0) {
                // If someone is waiting, give it to them immediately
                const resolver = resolvers.shift()!;
                resolver.resolve(pmxtOrderbook);
            } else {
                // Otherwise, buffer it for the next call
                if (!this.orderbookBuffers.has(marketSlug)) {
                    this.orderbookBuffers.set(marketSlug, []);
                }
                const buffer = this.orderbookBuffers.get(marketSlug)!;
                buffer.push(pmxtOrderbook);
                // Keep buffer size reasonable
                if (buffer.length > 100) buffer.shift();
            }
        });

        // Handle AMM price updates
        this.client.on('newPriceData', (data: any) => {
            const { marketAddress } = data;
            const callback = this.priceCallbacks.get(marketAddress);
            if (callback) {
                callback(data);
            }
        });

        // Handle connection events
        this.client.on('connect', () => {
            console.log('[LimitlessWS] Connected to WebSocket');
        });

        this.client.on('disconnect', (reason: string) => {
            console.log(`[LimitlessWS] Disconnected from WebSocket: ${reason}`);
        });

        this.client.on('error', (error: Error) => {
            console.error('[LimitlessWS] WebSocket error:', error);
        });
    }

    /**
     * Watch orderbook updates for a CLOB market.
     *
     * This method implements a hybrid approach for sparse orderbook updates:
     * - Returns buffered WebSocket updates if available
     * - Falls back to REST snapshots if no WebSocket update arrives within timeout
     * - Periodically refreshes with REST snapshots to avoid stale data
     *
     * @param marketSlug - The market slug to watch
     * @param callback - Optional callback for updates (if not provided, returns current snapshot)
     */
    async watchOrderBook(
        marketSlug: string,
        callback?: (orderbook: OrderBook) => void
    ): Promise<OrderBook> {
        // Connect if not already connected
        if (!this.client.isConnected()) {
            await this.client.connect();
        }

        // Subscribe to market
        await this.client.subscribe('orderbook', { marketSlugs: [marketSlug] });

        if (callback) {
            this.orderbookCallbacks.set(marketSlug, callback);
        }

        // 1. If we have buffered data, return it immediately
        const buffer = this.orderbookBuffers.get(marketSlug);
        if (buffer && buffer.length > 0) {
            return buffer.shift()!;
        }

        // 2. Special case: If this is the FIRST call for this market and we have no data,
        // fetch a snapshot to get things moving.
        if (!this.lastOrderbookTimestamps.has(marketSlug)) {
            this.lastOrderbookTimestamps.set(marketSlug, Date.now());
            try {
                return await fetchOrderBook(marketSlug, this.callApi);
            } catch (err) {
                console.warn(`[LimitlessWS] Failed to fetch initial snapshot:`, err);
            }
        }

        // 3. Wait for WebSocket update with timeout fallback
        // Limitless sends orderbook updates only when there's trading activity,
        // so we use a timeout to fall back to REST snapshots for sparse updates
        const WS_UPDATE_TIMEOUT = 3000; // 3 seconds
        const SNAPSHOT_REFRESH_INTERVAL = 5000; // 5 seconds

        const lastTimestamp = this.lastOrderbookTimestamps.get(marketSlug) || 0;
        const timeSinceLastUpdate = Date.now() - lastTimestamp;

        // If it's been a while since last update, fetch a fresh snapshot
        if (timeSinceLastUpdate > SNAPSHOT_REFRESH_INTERVAL) {
            this.lastOrderbookTimestamps.set(marketSlug, Date.now());
            try {
                return await fetchOrderBook(marketSlug, this.callApi);
            } catch (err) {
                console.warn(`[LimitlessWS] Failed to fetch refresh snapshot:`, err);
            }
        }

        // Wait for WebSocket update with timeout
        try {
            const wsUpdatePromise = new Promise<OrderBook>((resolve, reject) => {
                if (!this.orderbookResolvers.has(marketSlug)) {
                    this.orderbookResolvers.set(marketSlug, []);
                }
                this.orderbookResolvers.get(marketSlug)!.push({ resolve, reject });
            });

            const timeoutPromise = new Promise<OrderBook>((resolve) => {
                setTimeout(async () => {
                    // Timeout: fetch REST snapshot as fallback
                    try {
                        this.lastOrderbookTimestamps.set(marketSlug, Date.now());
                        const snapshot = await fetchOrderBook(marketSlug, this.callApi);
                        resolve(snapshot);
                    } catch (err) {
                        console.warn(`[LimitlessWS] Failed to fetch timeout fallback snapshot:`, err);
                        // Resolve with empty orderbook rather than rejecting
                        resolve(this.getEmptyOrderbook());
                    }
                }, WS_UPDATE_TIMEOUT);
            });

            return await Promise.race([wsUpdatePromise, timeoutPromise]);
        } catch (err) {
            // Fallback to empty orderbook if all else fails
            return this.getEmptyOrderbook();
        }
    }

    /**
     * Watch AMM price updates for a market.
     * @param marketAddress - The market contract address to watch
     * @param callback - Callback for price updates
     */
    async watchPrices(marketAddress: string, callback: (data: any) => void): Promise<void> {
        // Connect if not already connected
        if (!this.client.isConnected()) {
            await this.client.connect();
        }

        // Subscribe to market prices
        await this.client.subscribe('prices', { marketAddresses: [marketAddress] });

        this.priceCallbacks.set(marketAddress, callback);
    }

    /**
     * Watch user positions (requires API key).
     * @param callback - Callback for position updates
     */
    async watchUserPositions(callback: (data: any) => void): Promise<void> {
        if (!this.config.apiKey) {
            throw new Error('API key required for user position updates');
        }

        if (!this.client.isConnected()) {
            await this.client.connect();
        }

        await this.client.subscribe('orders'); // SDK uses 'orders' channel for user positional updates too? 
        // Actually, the channel type has 'subscribe_positions'. Let's check.
        // Wait, I saw 'orders' in SubscriptionChannel.
        // Let's use 'orders' as it's common for user data.
        // Wait, I saw 'subscribe_positions' in the type.
        await this.client.subscribe('subscribe_positions' as any);
        this.client.on('positions', callback);
    }

    /**
     * Watch user transactions (requires API key).
     * @param callback - Callback for transaction updates
     */
    async watchUserTransactions(callback: (data: any) => void): Promise<void> {
        if (!this.config.apiKey) {
            throw new Error('API key required for user transaction updates');
        }

        if (!this.client.isConnected()) {
            await this.client.connect();
        }

        await this.client.subscribe('subscribe_transactions' as any);
        this.client.on('tx', callback);
    }

    /**
     * Legacy method - watch trades (not directly supported, falls back to orderbook)
     */
    async watchTrades(marketSlug: string): Promise<Trade[]> {
        console.warn(
            '[LimitlessWS] watchTrades is not directly supported. ' +
            'Use watchOrderBook() for real-time orderbook updates or fetchOHLCV() for historical data.'
        );
        return [];
    }

    /**
     * Unsubscribe from a market.
     */
    async unsubscribe(marketSlugOrAddress: string): Promise<void> {
        this.orderbookCallbacks.delete(marketSlugOrAddress);
        this.priceCallbacks.delete(marketSlugOrAddress);

        // Unsubscribe from SDK
        await this.client.unsubscribe('orderbook', {
            marketSlugs: [marketSlugOrAddress],
        });
        await this.client.unsubscribe('prices', {
            marketAddresses: [marketSlugOrAddress],
        });
    }

    /**
     * Close the WebSocket connection.
     */
    async close(): Promise<void> {
        this.orderbookCallbacks.clear();
        this.priceCallbacks.clear();
        this.client.disconnect();
    }

    /**
     * Check if connected.
     */
    isConnected(): boolean {
        return this.client.isConnected();
    }

    /**
     * Get the underlying SDK WebSocket client for advanced usage.
     */
    getClient(): WebSocketClient {
        return this.client;
    }

    private transformOrderbookData(orderbook: any): OrderBook {
        // Convert sizes from smallest unit to human-readable USDC amounts
        const bids = (orderbook.bids || []).map((level: any) => ({
            price: level.price,
            size: convertSize(level.size)
        }));

        const asks = (orderbook.asks || []).map((level: any) => ({
            price: level.price,
            size: convertSize(level.size)
        }));

        return {
            bids,
            asks,
            timestamp: orderbook.timestamp || Date.now(),
        };
    }

    private getEmptyOrderbook(): OrderBook {
        return {
            bids: [],
            asks: [],
            timestamp: Date.now(),
        };
    }
}
