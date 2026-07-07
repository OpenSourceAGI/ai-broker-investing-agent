import { PredictionMarketExchange, MarketFilterParams, HistoryFilterParams, OHLCVParams, TradesParams, ExchangeCredentials, EventFetchParams, MyTradesParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade, Balance, Order, Position, CreateOrderParams } from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { fetchEvents } from './fetchEvents';
import { fetchOHLCV } from './fetchOHLCV';
import { fetchOrderBook } from './fetchOrderBook';
import { MyriadAuth } from './auth';
import { MyriadWebSocket } from './websocket';
import { myriadErrorMapper } from './errors';
import { AuthenticationError } from '../../errors';
import { BASE_URL } from './utils';
import { parseOpenApiSpec } from '../../utils/openapi';
import { myriadApiSpec } from './api';

export class MyriadExchange extends PredictionMarketExchange {
    override readonly has = {
        fetchMarkets: true as const,
        fetchEvents: true as const,
        fetchOHLCV: true as const,
        fetchOrderBook: 'emulated' as const,
        fetchTrades: true as const,
        createOrder: 'emulated' as const,
        cancelOrder: false as const,
        fetchOrder: false as const,
        fetchOpenOrders: 'emulated' as const,
        fetchPositions: true as const,
        fetchBalance: 'emulated' as const,
        watchOrderBook: 'emulated' as const,
        watchTrades: 'emulated' as const,
        fetchMyTrades: true as const,
        fetchClosedOrders: false as const,
        fetchAllOrders: false as const,
    };

    private auth?: MyriadAuth;
    private ws?: MyriadWebSocket;

    constructor(credentials?: ExchangeCredentials) {
        super(credentials);
        this.rateLimit = 500;
        if (credentials?.apiKey) {
            this.auth = new MyriadAuth(credentials);
        }

        const descriptor = parseOpenApiSpec(myriadApiSpec, BASE_URL);
        this.defineImplicitApi(descriptor);
    }

    get name(): string {
        return 'Myriad';
    }

    private getHeaders(): Record<string, string> {
        if (this.auth) {
            return this.auth.getHeaders();
        }
        return { 'Content-Type': 'application/json' };
    }

    protected override sign(_method: string, _path: string, _params: Record<string, any>): Record<string, string> {
        return this.getHeaders();
    }

    protected override mapImplicitApiError(error: any): any {
        throw myriadErrorMapper.mapError(error);
    }

    private ensureAuth(): MyriadAuth {
        if (!this.auth) {
            throw new AuthenticationError(
                'This operation requires authentication. Initialize MyriadExchange with credentials (apiKey).',
                'Myriad'
            );
        }
        return this.auth;
    }

    // ------------------------------------------------------------------------
    // Market Data
    // ------------------------------------------------------------------------

    protected async fetchMarketsImpl(params?: MarketFilterParams): Promise<UnifiedMarket[]> {
        return fetchMarkets(params, this.getHeaders(), this.http);
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        return fetchEvents(params, this.getHeaders(), this.http);
    }

    async fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams): Promise<PriceCandle[]> {
        return fetchOHLCV(id, params, this.callApi.bind(this));
    }

    async fetchOrderBook(id: string): Promise<OrderBook> {
        return fetchOrderBook(id, this.callApi.bind(this));
    }

    async fetchTrades(id: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]> {
        if ('resolution' in params && params.resolution !== undefined) {
            console.warn(
                '[pmxt] Warning: The "resolution" parameter is deprecated for fetchTrades() and will be ignored. ' +
                'It will be removed in v3.0.0. Please remove it from your code.'
            );
        }

        const parts = id.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid Myriad ID format: "${id}". Expected "{networkId}:{marketId}" or "{networkId}:{marketId}:{outcomeId}".`);
        }

        const [networkId, marketId] = parts;
        const outcomeId = parts.length >= 3 ? parts[2] : undefined;

        const ensureDate = (d: any): Date => {
            if (typeof d === 'string') {
                if (!d.endsWith('Z') && !d.match(/[+-]\d{2}:\d{2}$/)) return new Date(d + 'Z');
                return new Date(d);
            }
            return d;
        };

        const queryParams: Record<string, any> = {
            id: marketId,
            network_id: Number(networkId),
            page: 1,
            limit: params.limit || 100,
        };

        if (params.start) queryParams.since = Math.floor(ensureDate(params.start).getTime() / 1000);
        if (params.end) queryParams.until = Math.floor(ensureDate(params.end).getTime() / 1000);

        const data = await this.callApi('getMarketsEvents', queryParams);
        const events = data.data || data.events || [];

        const tradeEvents = events.filter((e: any) => e.action === 'buy' || e.action === 'sell');
        const filtered = outcomeId
            ? tradeEvents.filter((e: any) => String(e.outcomeId) === outcomeId)
            : tradeEvents;

        return filtered.map((t: any, index: number) => ({
            id: `${t.blockNumber || t.timestamp}-${index}`,
            timestamp: (t.timestamp || 0) * 1000,
            price: t.shares > 0 ? Number(t.value) / Number(t.shares) : 0,
            amount: Number(t.shares || 0),
            side: t.action === 'buy' ? 'buy' as const : 'sell' as const,
        }));
    }

    async fetchMyTrades(params?: MyTradesParams): Promise<UserTrade[]> {
        const walletAddress = this.ensureAuth().walletAddress;
        if (!walletAddress) {
            throw new AuthenticationError(
                'fetchMyTrades requires a wallet address. Pass privateKey as the wallet address in credentials.',
                'Myriad'
            );
        }
        const queryParams: Record<string, any> = { address: walletAddress };
        if (params?.marketId) {
            const parts = params.marketId.split(':');
            if (parts.length >= 2) queryParams.market_id = parts[1];
        }
        if (params?.since) queryParams.since = Math.floor(params.since.getTime() / 1000);
        if (params?.until) queryParams.until = Math.floor(params.until.getTime() / 1000);
        if (params?.limit) queryParams.limit = params.limit;

        const data = await this.callApi('getUsersEvents', queryParams);
        const events = data.data || data.events || [];
        const tradeEvents = events.filter((e: any) => e.action === 'buy' || e.action === 'sell');
        return tradeEvents.map((t: any, i: number) => ({
            id: `${t.blockNumber || t.timestamp}-${i}`,
            timestamp: (t.timestamp || 0) * 1000,
            price: t.shares > 0 ? Number(t.value) / Number(t.shares) : 0,
            amount: Number(t.shares || 0),
            side: t.action === 'buy' ? 'buy' as const : 'sell' as const,
        }));
    }

    // ------------------------------------------------------------------------
    // Trading
    // ------------------------------------------------------------------------

    async createOrder(params: CreateOrderParams): Promise<Order> {
        // Parse composite marketId: {networkId}:{marketId}
        const parts = params.marketId.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid marketId format: "${params.marketId}". Expected "{networkId}:{marketId}".`);
        }
        const [networkId, marketId] = parts;

        // Parse outcomeId: {networkId}:{marketId}:{outcomeId}
        const outcomeParts = params.outcomeId.split(':');
        const outcomeId = outcomeParts.length >= 3 ? Number(outcomeParts[2]) : Number(outcomeParts[0]);

        const quoteBody: Record<string, any> = {
            market_id: Number(marketId),
            outcome_id: outcomeId,
            network_id: Number(networkId),
            action: params.side,
        };

        if (params.side === 'buy') {
            quoteBody.value = params.amount;
        } else {
            quoteBody.shares = params.amount;
        }

        if (params.price) {
            quoteBody.slippage = 0.01;
        }

        const quote = await this.callApi('postMarketsQuote', quoteBody);

        return {
            id: `myriad-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            marketId: params.marketId,
            outcomeId: params.outcomeId,
            side: params.side,
            type: 'market',
            price: quote.price_average,
            amount: params.side === 'buy' ? quote.value : quote.shares,
            status: 'pending',
            filled: 0,
            remaining: params.side === 'buy' ? quote.value : quote.shares,
            timestamp: Date.now(),
            fee: quote.fees ? (quote.fees.fee + quote.fees.treasury + quote.fees.distributor) : undefined,
        };
    }

    async cancelOrder(_orderId: string): Promise<Order> {
        throw new Error('cancelOrder() is not supported by Myriad (AMM-based exchange, no open orders)');
    }

    async fetchOrder(_orderId: string): Promise<Order> {
        throw new Error('fetchOrder() is not supported by Myriad (AMM-based exchange)');
    }

    async fetchOpenOrders(_marketId?: string): Promise<Order[]> {
        return []; // AMM: no open orders
    }

    async fetchPositions(): Promise<Position[]> {
        const walletAddress = this.ensureAuth().walletAddress;
        if (!walletAddress) {
            throw new AuthenticationError(
                'fetchPositions requires a wallet address. Pass privateKey as the wallet address in credentials.',
                'Myriad'
            );
        }

        const data = await this.callApi('getUsersPortfolio', { address: walletAddress, limit: 100 });
        const items = data.data || data.items || [];

        return items.map((pos: any) => ({
            marketId: `${pos.networkId}:${pos.marketId}`,
            outcomeId: `${pos.networkId}:${pos.marketId}:${pos.outcomeId}`,
            outcomeLabel: pos.outcomeTitle || `Outcome ${pos.outcomeId}`,
            size: Number(pos.shares || 0),
            entryPrice: Number(pos.price || 0),
            currentPrice: Number(pos.value || 0) / Math.max(Number(pos.shares || 1), 1),
            unrealizedPnL: Number(pos.profit || 0),
        }));
    }

    async fetchBalance(): Promise<Balance[]> {
        const walletAddress = this.ensureAuth().walletAddress;
        if (!walletAddress) {
            throw new AuthenticationError(
                'fetchBalance requires a wallet address. Pass privateKey as the wallet address in credentials.',
                'Myriad'
            );
        }

        const data = await this.callApi('getUsersPortfolio', { address: walletAddress, limit: 100 });
        const items = data.data || data.items || [];

        let totalValue = 0;
        for (const pos of items) {
            totalValue += Number(pos.value || 0);
        }

        return [{
            currency: 'USDC',
            total: totalValue,
            available: 0,
            locked: totalValue,
        }];
    }

    // ------------------------------------------------------------------------
    // WebSocket (poll-based)
    // ------------------------------------------------------------------------

    async watchOrderBook(id: string, _limit?: number): Promise<OrderBook> {
        this.ensureAuth();
        if (!this.ws) {
            this.ws = new MyriadWebSocket(this.callApi.bind(this));
        }
        return this.ws.watchOrderBook(id);
    }

    async watchTrades(id: string, _since?: number, _limit?: number): Promise<Trade[]> {
        this.ensureAuth();
        if (!this.ws) {
            this.ws = new MyriadWebSocket(this.callApi.bind(this));
        }
        return this.ws.watchTrades(id);
    }

    async close(): Promise<void> {
        if (this.ws) {
            await this.ws.close();
            this.ws = undefined;
        }
    }
}
