import {
    PredictionMarketExchange,
    MarketFilterParams,
    MarketFetchParams,
    HistoryFilterParams,
    OHLCVParams,
    TradesParams,
    ExchangeCredentials,
    EventFetchParams,
    MyTradesParams,
    OrderHistoryParams,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    PriceCandle,
    OrderBook,
    Trade,
    UserTrade,
    Order,
    Position,
    Balance,
    CreateOrderParams,
} from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { fetchEvents } from './fetchEvents';
import { fetchOHLCV } from './fetchOHLCV';
import { fetchOrderBook } from './fetchOrderBook';
import { fetchTrades } from './fetchTrades';
import { LimitlessAuth } from './auth';
import { LimitlessClient } from './client';
import { LimitlessWebSocket, LimitlessWebSocketConfig } from './websocket';
import { limitlessErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { PortfolioFetcher, getContractAddress } from '@limitless-exchange/sdk';
import { Contract, providers } from 'ethers';
import { parseOpenApiSpec } from '../../utils/openapi';
import { limitlessApiSpec } from './api';

// Re-export for external use
export type { LimitlessWebSocketConfig };

export interface LimitlessExchangeOptions {
    credentials?: ExchangeCredentials;
    websocket?: LimitlessWebSocketConfig;
}

export class LimitlessExchange extends PredictionMarketExchange {
    override readonly has = {
        fetchMarkets: true as const,
        fetchEvents: true as const,
        fetchOHLCV: true as const,
        fetchOrderBook: true as const,
        fetchTrades: true as const,
        createOrder: true as const,
        cancelOrder: true as const,
        fetchOrder: false as const,
        fetchOpenOrders: true as const,
        fetchPositions: true as const,
        fetchBalance: true as const,
        watchOrderBook: true as const,
        watchTrades: true as const,
        fetchMyTrades: true as const,
        fetchClosedOrders: true as const,
        fetchAllOrders: true as const,
    };

    private auth?: LimitlessAuth;
    private client?: LimitlessClient;
    private wsConfig?: LimitlessWebSocketConfig;

    constructor(options?: ExchangeCredentials | LimitlessExchangeOptions) {
        // Support both old signature (credentials only) and new signature (options object)
        let credentials: ExchangeCredentials | undefined;
        let wsConfig: LimitlessWebSocketConfig | undefined;

        if (options && 'credentials' in options) {
            // New signature: LimitlessExchangeOptions
            credentials = options.credentials;
            wsConfig = options.websocket;
        } else if (options && 'privateKey' in options) {
            // Support direct privateKey for easier initialization
            credentials = options as ExchangeCredentials;
        } else {
            // Old signature: ExchangeCredentials directly
            credentials = options as ExchangeCredentials | undefined;
        }

        super(credentials);
        this.rateLimit = 200;
        this.wsConfig = wsConfig;

        // Initialize auth if API key or private key are provided
        // API key is now the primary authentication method
        if (credentials?.apiKey || credentials?.privateKey) {
            try {
                this.auth = new LimitlessAuth(credentials);

                // Initialize client only if we have both privateKey and apiKey
                if (credentials.privateKey) {
                    const apiKey = this.auth.getApiKey();
                    this.client = new LimitlessClient(credentials.privateKey, apiKey);
                }
            } catch (error) {
                // If auth initialization fails, continue without it
                // Some methods (like fetchMarkets) work without auth
                console.warn('Failed to initialize Limitless auth:', error);
            }
        }

        // Register implicit API for Limitless REST endpoints
        const apiDescriptor = parseOpenApiSpec(limitlessApiSpec);
        this.defineImplicitApi(apiDescriptor);
    }

    get name(): string {
        return 'Limitless';
    }

    // ----------------------------------------------------------------------------
    // Implicit API Error Mapping
    // ----------------------------------------------------------------------------

    protected override mapImplicitApiError(error: any): any {
        throw limitlessErrorMapper.mapError(error);
    }

    // ----------------------------------------------------------------------------
    // Implementation methods for CCXT-style API
    // ----------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        // Pass API key if available for authenticated requests
        const apiKey = this.auth?.getApiKey();
        return fetchMarkets(params, apiKey, this.callApi.bind(this));
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        return fetchEvents(params, this.callApi.bind(this), this.http);
    }

    async fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams): Promise<PriceCandle[]> {
        return fetchOHLCV(id, params, this.callApi.bind(this));
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        return fetchOrderBook(id, this.callApi.bind(this));
    }

    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        // Deprecation warning
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.'
            );
        }
        return fetchTrades(id, params, this.http);
    }

    // ----------------------------------------------------------------------------
    // Trading Methods
    // ----------------------------------------------------------------------------

    private ensureClient(): LimitlessClient {
        if (!this.client) {
            throw new Error(
                'Trading operations require authentication. ' +
                'Initialize LimitlessExchange with credentials: new LimitlessExchange({ privateKey: "0x...", apiKey: "lmts_..." })'
            );
        }
        return this.client;
    }

    /**
     * Ensure authentication is initialized before trading operations.
     */
    private ensureAuth(): LimitlessAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize LimitlessExchange with credentials: new LimitlessExchange({ privateKey: "0x...", apiKey: "lmts_..." })',
                'Limitless'
            );
        }
        return this.auth;
    }

    async createOrder(params: CreateOrderParams): Promise<Order> {
        const client = this.ensureClient();

        try {
            const side = params.side.toUpperCase() as 'BUY' | 'SELL';

            // Note: params.marketId in pmxt LIMITLESS implementation corresponds to the SLUG.
            // See utils.ts mapMarketToUnified: id = market.slug
            const marketSlug = params.marketId;

            if (!params.price) {
                throw new Error('Limit orders require a price');
            }

            // Limitless (USDC on Base) supports 6 decimals max.
            const price = Math.round(params.price * 1_000_000) / 1_000_000;

            const response = await client.createOrder({
                marketSlug: marketSlug,
                outcomeId: params.outcomeId,
                side: side,
                price: price,
                amount: params.amount,
                type: params.type,
            });

            // Map response to Order object
            // The SDK returns OrderResponse with order.id
            return {
                id: response.order.id || 'unknown',
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: params.price,
                amount: params.amount,
                status: 'open',
                filled: 0,
                remaining: params.amount,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async cancelOrder(orderId: string): Promise<Order> {
        const client = this.ensureClient();

        try {
            await client.cancelOrder(orderId);

            return {
                id: orderId,
                marketId: 'unknown',
                outcomeId: 'unknown',
                side: 'buy',
                type: 'limit',
                amount: 0,
                status: 'cancelled',
                filled: 0,
                remaining: 0,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchOrder(orderId: string): Promise<Order> {
        // Limitless API does not support fetching a single order by ID directly without the market slug.
        // We would need to scan all markets or maintain a local cache.
        // For now, we throw specific error.
        throw new Error(
            'Limitless: fetchOrder(id) is not supported directly. Use fetchOpenOrders(marketSlug).'
        );
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        const client = this.ensureClient();

        try {
            if (!marketId) {
                // We cannot fetch ALL open orders globally efficiently on Limitless (no endpoint).
                // We would need to fetch all active markets and query each.
                // For this MVP, we return empty or throw. Returning empty to be "compliant" with interface but logging warning.
                console.warn(
                    'Limitless: fetchOpenOrders requires marketId (slug) to be efficient. Returning [].'
                );
                return [];
            }

            const orders = await client.getOrders(marketId, ['LIVE']);

            return orders.map((o: any) => ({
                id: o.id,
                marketId: marketId,
                outcomeId: o.tokenId || 'unknown',
                side: o.side.toLowerCase() as 'buy' | 'sell',
                type: 'limit',
                price: parseFloat(o.price),
                amount: parseFloat(o.quantity),
                status: 'open',
                filled: 0,
                remaining: parseFloat(o.quantity),
                timestamp: Date.now(),
            }));
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const auth = this.ensureAuth();
        try {
            const response = await this.http.get('https://api.limitless.exchange/portfolio/trades', {
                headers: { Authorization: `Bearer ${auth.getApiKey()}` },
            });
            const trades = Array.isArray(response.data) ? response.data : (response.data?.data || []);
            return trades.map((t: any) => ({
                id: t.id || String(t.timestamp),
                timestamp: t.createdAt ? new Date(t.createdAt).getTime() : (t.timestamp || 0),
                price: parseFloat(t.price || '0'),
                amount: parseFloat(t.quantity || t.amount || '0'),
                side: (t.side || '').toLowerCase() === 'buy' ? 'buy' as const : 'sell' as const,
                orderId: t.orderId,
            }));
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    async fetchClosedOrders(params?: OrderHistoryParams): Promise<Order[]> {
        const client = this.ensureClient();
        if (!params?.marketId) {
            console.warn('Limitless: fetchClosedOrders requires marketId (slug). Returning [].');
            return [];
        }
        const orders = await client.getOrders(params.marketId, ['MATCHED']);
        return orders.map((o: any) => ({
            id: o.id,
            marketId: params.marketId!,
            outcomeId: o.tokenId || 'unknown',
            side: o.side.toLowerCase() as 'buy' | 'sell',
            type: 'limit' as const,
            price: parseFloat(o.price),
            amount: parseFloat(o.quantity),
            status: 'filled' as const,
            filled: parseFloat(o.quantity),
            remaining: 0,
            timestamp: o.createdAt ? new Date(o.createdAt).getTime() : Date.now(),
        }));
    }

    async fetchAllOrders(params?: OrderHistoryParams): Promise<Order[]> {
        const client = this.ensureClient();
        if (!params?.marketId) {
            console.warn('Limitless: fetchAllOrders requires marketId (slug). Returning [].');
            return [];
        }
        const orders = await client.getOrders(params.marketId, ['LIVE', 'MATCHED']);
        return orders.map((o: any) => ({
            id: o.id,
            marketId: params.marketId!,
            outcomeId: o.tokenId || 'unknown',
            side: o.side.toLowerCase() as 'buy' | 'sell',
            type: 'limit' as const,
            price: parseFloat(o.price),
            amount: parseFloat(o.quantity),
            status: o.status === 'LIVE' ? 'open' as const : 'filled' as const,
            filled: o.status === 'MATCHED' ? parseFloat(o.quantity) : 0,
            remaining: o.status === 'LIVE' ? parseFloat(o.quantity) : 0,
            timestamp: o.createdAt ? new Date(o.createdAt).getTime() : Date.now(),
        }));
    }

    async fetchPositions(): Promise<Position[]> {
        const auth = this.ensureAuth();
        const address = auth.getAddress();
        const result = await this.callApi('PublicPortfolioController_getPositions', { account: address });
        const data = result?.data || result || [];
        return data.map((p: any) => ({
            marketId: p.market?.slug || p.conditionId,
            outcomeId: p.asset,
            outcomeLabel: p.outcome || 'Unknown',
            size: parseFloat(p.size || '0'),
            entryPrice: parseFloat(p.avgPrice || '0'),
            currentPrice: parseFloat(p.curPrice || '0'),
            unrealizedPnL: parseFloat(p.cashPnl || '0'),
            realizedPnL: parseFloat(p.realizedPnl || '0'),
        }));
    }

    async fetchBalance(): Promise<Balance[]> {
        const auth = this.ensureAuth();

        try {
            // Query USDC balance directly from the blockchain
            // Base chain RPC (not Polygon)
            const provider = new providers.JsonRpcProvider('https://mainnet.base.org');
            const address = auth.getAddress();

            // Get USDC contract address for Base
            const usdcAddress = getContractAddress('USDC');

            // USDC ERC20 ABI (balanceOf only)
            const usdcContract = new Contract(
                usdcAddress,
                ['function balanceOf(address) view returns (uint256)'],
                provider
            );

            // Query balance
            const rawBalance = await usdcContract.balanceOf(address);

            // USDC has 6 decimals
            const USDC_DECIMALS = 6;
            const total = parseFloat(rawBalance.toString()) / Math.pow(10, USDC_DECIMALS);

            return [
                {
                    currency: 'USDC',
                    total: total,
                    available: total, // On-chain balance is all available
                    locked: 0,
                },
            ];
        } catch (error: any) {
            throw limitlessErrorMapper.mapError(error);
        }
    }

    // ----------------------------------------------------------------------------
    // WebSocket Methods
    // ----------------------------------------------------------------------------

    private ws?: LimitlessWebSocket;

    /**
     * Initialize WebSocket with API key if available.
     */
    private initWebSocket(): LimitlessWebSocket {
        if (!this.ws) {
            const wsConfig = {
                ...this.wsConfig,
                apiKey: this.auth?.getApiKey(),
            };
            this.ws = new LimitlessWebSocket(this.callApi.bind(this), wsConfig);
        }
        return this.ws;
    }

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        const ws = this.initWebSocket();
        // Return the snapshot immediately (this allows the script to proceed)
        // Future versions could implement a more sophisticated queueing system
        return ws.watchOrderBook(id);
    }

    async watchTrades(id: string, since?: number, limit?: number): Promise<Trade[]> {
        const ws = this.initWebSocket();
        return ws.watchTrades(id);
    }

    /**
     * Watch AMM price updates for a market address (Limitless only).
     * Requires WebSocket connection.
     *
     * @param marketAddress - Market contract address
     * @param callback - Callback for price updates
     *
     * @example-ts Watch prices
     * await exchange.watchPrices(marketAddress, (data) => {
     *   console.log('Price update:', data);
     * });
     *
     * @example-python Watch prices
     * exchange.watch_prices(market_address, callback=lambda data: print('Price update:', data))
     */
    async watchPrices(marketAddress: string, callback: (data: any) => void): Promise<void> {
        const ws = this.initWebSocket();
        return ws.watchPrices(marketAddress, callback);
    }

    /**
     * Watch user positions in real-time (Limitless only).
     * Requires API key authentication.
     *
     * @param callback - Callback for position updates
     *
     * @example-ts Watch positions
     * await exchange.watchUserPositions((data) => {
     *   console.log('Position update:', data);
     * });
     *
     * @example-python Watch positions
     * exchange.watch_user_positions(callback=lambda data: print('Position update:', data))
     */
    async watchUserPositions(callback: (data: any) => void): Promise<void> {
        this.ensureAuth(); // Ensure API key is available
        const ws = this.initWebSocket();
        return ws.watchUserPositions(callback);
    }

    /**
     * Watch user transactions in real-time (Limitless only).
     * Requires API key authentication.
     *
     * @param callback - Callback for transaction updates
     *
     * @example-ts Watch transactions
     * await exchange.watchUserTransactions((data) => {
     *   console.log('Transaction:', data);
     * });
     *
     * @example-python Watch transactions
     * exchange.watch_user_transactions(callback=lambda data: print('Transaction:', data))
     */
    async watchUserTransactions(callback: (data: any) => void): Promise<void> {
        this.ensureAuth(); // Ensure API key is available
        const ws = this.initWebSocket();
        return ws.watchUserTransactions(callback);
    }

    async close(): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
    }
}
