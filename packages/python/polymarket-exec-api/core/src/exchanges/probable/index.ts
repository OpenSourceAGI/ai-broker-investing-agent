import {
    PredictionMarketExchange,
    MarketFetchParams,
    EventFetchParams,
    ExchangeCredentials,
    OHLCVParams,
    HistoryFilterParams,
    TradesParams,
    MyTradesParams,
} from '../../BaseExchange';
import {
    UnifiedMarket,
    UnifiedEvent,
    OrderBook,
    PriceCandle,
    CandleInterval,
    Trade,
    UserTrade,
    Order,
    Position,
    Balance,
    CreateOrderParams,
} from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { fetchEvents, fetchEventById, fetchEventBySlug } from './fetchEvents';
import { fetchTrades } from './fetchTrades';
import { ProbableAuth } from './auth';
import { ProbableWebSocket, ProbableWebSocketConfig } from './websocket';
import { probableErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { OrderSide } from '@prob/clob';
import { parseOpenApiSpec } from '../../utils/openapi';
import { probableApiSpec } from './api';
import { BASE_URL } from './utils';

const BSC_USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

function aggregateCandles(candles: PriceCandle[], intervalMs: number): PriceCandle[] {
    if (candles.length === 0) return [];
    const buckets = new Map<number, PriceCandle>();
    for (const c of candles) {
        const key = Math.floor(c.timestamp / intervalMs) * intervalMs;
        const existing = buckets.get(key);
        if (!existing) {
            buckets.set(key, { ...c, timestamp: key });
        } else {
            existing.high = Math.max(existing.high, c.high);
            existing.low = Math.min(existing.low, c.low);
            existing.close = c.close;
        }
    }
    return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export class ProbableExchange extends PredictionMarketExchange {
    override readonly has = {
        fetchMarkets: true as const,
        fetchEvents: true as const,
        fetchOHLCV: true as const,
        fetchOrderBook: true as const,
        fetchTrades: true as const,
        createOrder: true as const,
        cancelOrder: true as const,
        fetchOrder: true as const,
        fetchOpenOrders: true as const,
        fetchPositions: true as const,
        fetchBalance: true as const,
        watchOrderBook: true as const,
        watchTrades: false as const,
        fetchMyTrades: true as const,
        fetchClosedOrders: false as const,
        fetchAllOrders: false as const,
    };

    private auth?: ProbableAuth;
    private ws?: ProbableWebSocket;
    private wsConfig?: ProbableWebSocketConfig;

    constructor(credentials?: ExchangeCredentials, wsConfig?: ProbableWebSocketConfig) {
        super(credentials);
        this.rateLimit = 500;
        this.wsConfig = wsConfig;

        if (credentials?.privateKey && credentials?.apiKey && credentials?.apiSecret && credentials?.passphrase) {
            this.auth = new ProbableAuth(credentials);
        }

        const descriptor = parseOpenApiSpec(probableApiSpec, BASE_URL);
        this.defineImplicitApi(descriptor);
    }

    get name(): string {
        return 'Probable';
    }

    protected override mapImplicitApiError(error: any): any {
        throw probableErrorMapper.mapError(error);
    }

    private ensureAuth(): ProbableAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'Trading operations require authentication. ' +
                'Initialize ProbableExchange with credentials: new ProbableExchange({ privateKey: "0x...", apiKey: "...", apiSecret: "...", passphrase: "..." })',
                'Probable'
            );
        }
        return this.auth;
    }

    // --------------------------------------------------------------------------
    // Market Data (read-only, no auth needed)
    // --------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(
            params,
            this.http,
            (tokenId) => this.callApi('getPublicApiV1Midpoint', { token_id: tokenId }),
            (queryParams) => this.callApi('getPublicApiV1PublicSearch', queryParams)
        );
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        return fetchEvents(
            params,
            this.http,
            (tokenId) => this.callApi('getPublicApiV1Midpoint', { token_id: tokenId }),
            (queryParams) => this.callApi('getPublicApiV1PublicSearch', queryParams)
        );
    }

    /**
     * Fetch a single event by its numeric ID (Probable only).
     *
     * @param id - The numeric event ID
     * @returns The UnifiedEvent, or null if not found
     *
     * @example-ts Get event by ID
     * const event = await exchange.getEventById('42');
     * if (event) {
     *   console.log(event.title);
     *   console.log(event.markets.length, 'markets');
     * }
     *
     * @example-python Get event by ID
     * event = exchange.get_event_by_id('42')
     * if event:
     *     print(event.title)
     *     print(len(event.markets), 'markets')
     */
    async getEventById(id: string): Promise<UnifiedEvent | null> {
        return fetchEventById(id, this.http, (tokenId) => this.callApi('getPublicApiV1Midpoint', { token_id: tokenId }));
    }

    /**
     * Fetch a single event by its URL slug (Probable only).
     *
     * @param slug - The event's URL slug (e.g. `"trump-2024-election"`)
     * @returns The UnifiedEvent, or null if not found
     *
     * @example-ts Get event by slug
     * const event = await exchange.getEventBySlug('trump-2024-election');
     * if (event) {
     *   console.log(event.title);
     * }
     *
     * @example-python Get event by slug
     * event = exchange.get_event_by_slug('trump-2024-election')
     * if event:
     *     print(event.title)
     */
    async getEventBySlug(slug: string): Promise<UnifiedEvent | null> {
        return fetchEventBySlug(slug, this.http, (tokenId) => this.callApi('getPublicApiV1Midpoint', { token_id: tokenId }));
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        const data = await this.callApi('getPublicApiV1Book', { token_id: id });
        const bids = (data.bids || [])
            .map((level: any) => ({ price: parseFloat(level.price), size: parseFloat(level.size) }))
            .sort((a: any, b: any) => b.price - a.price);
        const asks = (data.asks || [])
            .map((level: any) => ({ price: parseFloat(level.price), size: parseFloat(level.size) }))
            .sort((a: any, b: any) => a.price - b.price);
        return {
            bids,
            asks,
            timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
        };
    }

    async fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams): Promise<PriceCandle[]> {
        if (!params.resolution) {
            throw new Error('fetchOHLCV requires a resolution parameter.');
        }

        const INTERVAL_MAP: Record<CandleInterval, string> = {
            '1m': '1m',
            '5m': '1m',
            '15m': '1m',
            '1h': '1h',
            '6h': '6h',
            '1d': '1d',
        };

        const queryParams: Record<string, any> = {
            market: id,
            interval: INTERVAL_MAP[params.resolution] || '1h',
        };
        if (params.start) queryParams.startTs = Math.floor(params.start.getTime() / 1000);
        if (params.end) queryParams.endTs = Math.floor(params.end.getTime() / 1000);

        const data = await this.callApi('getPublicApiV1PricesHistory', queryParams);
        const points: any[] = data?.history || data || [];

        let candles: PriceCandle[] = points
            .map((p: any) => {
                const price = Number(p.p);
                const ts = Number(p.t) * 1000;
                return { timestamp: ts, open: price, high: price, low: price, close: price, volume: 0 };
            })
            .sort((a: PriceCandle, b: PriceCandle) => a.timestamp - b.timestamp);

        if (params.resolution === '5m') {
            candles = aggregateCandles(candles, 5 * 60 * 1000);
        } else if (params.resolution === '15m') {
            candles = aggregateCandles(candles, 15 * 60 * 1000);
        }

        if (params.limit) {
            candles = candles.slice(-params.limit);
        }

        return candles;
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const auth = this.ensureAuth();
        const address = auth.getAddress();

        const queryParams: Record<string, any> = { user: address };
        if (params?.limit) queryParams.limit = params.limit;

        const data = await this.callApi('getPublicApiV1Trades', queryParams);
        const trades = Array.isArray(data) ? data : (data.data || []);
        return trades.map((t: any) => ({
            id: String(t.tradeId || t.id || t.timestamp),
            timestamp: typeof t.time === 'number'
                ? (t.time > 1e12 ? t.time : t.time * 1000)
                : Date.now(),
            price: parseFloat(t.price || '0'),
            amount: parseFloat(t.qty || t.size || t.amount || '0'),
            side: (t.side || '').toLowerCase() === 'buy' ? 'buy' as const : 'sell' as const,
            orderId: t.orderId,
        }));
    }

    // --------------------------------------------------------------------------
    // Trading Methods
    // --------------------------------------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = auth.getClobClient();

            const side = params.side.toLowerCase() === 'buy' ? OrderSide.Buy : OrderSide.Sell;

            let unsignedOrder;

            if (params.type === 'market') {
                unsignedOrder = await client.createMarketOrder({
                    tokenId: params.outcomeId,
                    size: params.amount,
                    side,
                });
            } else {
                if (!params.price) {
                    throw new Error('Price is required for limit orders');
                }

                unsignedOrder = await client.createLimitOrder({
                    tokenId: params.outcomeId,
                    price: params.price,
                    size: params.amount,
                    side,
                });
            }

            if (params.fee !== undefined && params.fee !== null) {
                (unsignedOrder as any).feeRateBps = BigInt(params.fee);
            }

            const response = await client.postOrder(unsignedOrder);

            // postOrder returns PostOrderResponse which can be success or error
            if (response && 'code' in response && (response as any).code !== undefined) {
                throw new Error((response as any).msg || 'Order placement failed');
            }

            const orderResponse = response as any;

            return {
                id: String(orderResponse.orderId || orderResponse.id || ''),
                marketId: params.marketId,
                outcomeId: params.outcomeId,
                side: params.side,
                type: params.type,
                price: params.price || parseFloat(orderResponse.price || '0'),
                amount: params.amount,
                status: 'open',
                filled: parseFloat(orderResponse.executedQty || '0'),
                remaining: params.amount - parseFloat(orderResponse.executedQty || '0'),
                fee: params.fee,
                timestamp: orderResponse.time || Date.now(),
            };
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    /**
     * Cancel an order.
     * The Probable SDK requires both orderId and tokenId for cancellation.
     * Pass a compound key as "orderId:tokenId" to provide both values.
     */
    async cancelOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = auth.getClobClient();

            const [actualOrderId, tokenId] = parseCompoundId(orderId);

            if (!tokenId) {
                throw new Error(
                    'Probable cancelOrder requires a compound ID in the format "orderId:tokenId". ' +
                    'The tokenId (outcomeId) is required by the Probable SDK.'
                );
            }

            await client.cancelOrder({
                orderId: actualOrderId,
                tokenId,
            });

            return {
                id: actualOrderId,
                marketId: 'unknown',
                outcomeId: tokenId,
                side: 'buy',
                type: 'limit',
                amount: 0,
                status: 'cancelled',
                filled: 0,
                remaining: 0,
                timestamp: Date.now(),
            };
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    /**
     * Fetch a single order by ID.
     * Pass a compound key as "orderId:tokenId" since the SDK requires both.
     */
    async fetchOrder(orderId: string): Promise<Order> {
        try {
            const auth = this.ensureAuth();
            const client = auth.getClobClient();

            const [actualOrderId, tokenId] = parseCompoundId(orderId);

            if (!tokenId) {
                throw new Error(
                    'Probable fetchOrder requires a compound ID in the format "orderId:tokenId".'
                );
            }

            const order = await client.getOrder({
                orderId: actualOrderId,
                tokenId,
            });

            if (!order || ('code' in (order as any))) {
                throw new Error((order as any)?.msg || 'Order not found');
            }

            const o = order as any;
            return {
                id: String(o.orderId || o.id),
                marketId: o.symbol || 'unknown',
                outcomeId: o.tokenId || tokenId,
                side: (o.side || '').toLowerCase() as 'buy' | 'sell',
                type: o.type === 'LIMIT' || o.timeInForce === 'GTC' ? 'limit' : 'market',
                price: parseFloat(o.price || '0'),
                amount: parseFloat(o.origQty || '0'),
                status: mapOrderStatus(o.status),
                filled: parseFloat(o.executedQty || '0'),
                remaining: parseFloat(o.origQty || '0') - parseFloat(o.executedQty || '0'),
                timestamp: o.time || o.updateTime || Date.now(),
            };
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchOpenOrders(marketId?: string): Promise<Order[]> {
        try {
            const auth = this.ensureAuth();
            const client = auth.getClobClient();

            const params: any = {};
            if (marketId) {
                params.eventId = marketId;
            }

            const orders = await client.getOpenOrders(params);
            const orderList = Array.isArray(orders) ? orders : (orders as any)?.data || [];

            return orderList.map((o: any) => ({
                id: String(o.orderId || o.id),
                marketId: o.symbol || 'unknown',
                outcomeId: o.tokenId || '',
                side: (o.side || '').toLowerCase() as 'buy' | 'sell',
                type: 'limit' as const,
                price: parseFloat(o.price || '0'),
                amount: parseFloat(o.origQty || '0'),
                status: 'open' as const,
                filled: parseFloat(o.executedQty || '0'),
                remaining: parseFloat(o.origQty || '0') - parseFloat(o.executedQty || '0'),
                timestamp: o.time || o.updateTime || Date.now(),
            }));
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchPositions(): Promise<Position[]> {
        try {
            const auth = this.ensureAuth();
            const address = auth.getAddress();
            const result = await this.callApi('getPublicApiV1PositionCurrent', { user: address, limit: 500 });
            const data = Array.isArray(result) ? result : (result?.data || []);
            return data.map((p: any) => ({
                marketId: String(p.conditionId || p.condition_id || ''),
                outcomeId: String(p.asset || p.token_id || ''),
                outcomeLabel: p.outcome || p.title || 'Unknown',
                size: parseFloat(p.size || '0'),
                entryPrice: parseFloat(p.avgPrice || p.avg_price || '0'),
                currentPrice: parseFloat(p.curPrice || p.cur_price || '0'),
                unrealizedPnL: parseFloat(p.cashPnl || p.cash_pnl || '0'),
                realizedPnL: parseFloat(p.realizedPnl || p.realized_pnl || '0'),
            }));
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchBalance(): Promise<Balance[]> {
        try {
            const auth = this.ensureAuth();

            let total = 0;
            try {
                const { createPublicClient, http, parseAbi, formatUnits } = require('viem');
                const { bsc } = require('viem/chains');

                const publicClient = createPublicClient({
                    chain: bsc,
                    transport: http(),
                });

                const balance = await publicClient.readContract({
                    address: BSC_USDT_ADDRESS as `0x${string}`,
                    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
                    functionName: 'balanceOf',
                    args: [auth.getAddress() as `0x${string}`],
                });

                total = parseFloat(formatUnits(balance as bigint, 18));
            } catch (chainError: any) {
                // On-chain check failed, return 0
            }

            // Calculate locked from open BUY orders
            let locked = 0;
            try {
                const openOrders = await this.fetchOpenOrders();
                for (const order of openOrders) {
                    if (order.side === 'buy' && order.price) {
                        locked += order.remaining * order.price;
                    }
                }
            } catch {
                // If we can't fetch orders, locked stays 0
            }

            return [{
                currency: 'USDT',
                total,
                available: total - locked,
                locked,
            }];
        } catch (error: any) {
            throw probableErrorMapper.mapError(error);
        }
    }

    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        const auth = this.ensureAuth();
        const client = auth.getClobClient();
        return fetchTrades(id, params, client, this.http);
    }

    // --------------------------------------------------------------------------
    // WebSocket Streaming (public, no auth needed)
    // --------------------------------------------------------------------------

    async watchOrderBook(id: string, limit?: number): Promise<OrderBook> {
        if (!this.ws) {
            this.ws = new ProbableWebSocket(this.wsConfig);
        }
        return this.ws.watchOrderBook(id);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }
}

/**
 * Parse a compound ID in the format "orderId:tokenId".
 * Returns [orderId, tokenId] where tokenId may be undefined.
 */
function parseCompoundId(compoundId: string): [string, string | undefined] {
    const colonIndex = compoundId.indexOf(':');
    if (colonIndex === -1) {
        return [compoundId, undefined];
    }
    return [compoundId.substring(0, colonIndex), compoundId.substring(colonIndex + 1)];
}

function mapOrderStatus(status: string): 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' {
    if (!status) return 'open';
    const lower = status.toLowerCase();
    if (lower === 'new' || lower === 'open' || lower === 'partially_filled') return 'open';
    if (lower === 'filled' || lower === 'trade') return 'filled';
    if (lower === 'canceled' || lower === 'cancelled' || lower === 'expired') return 'cancelled';
    if (lower === 'rejected') return 'rejected';
    return 'open';
}
