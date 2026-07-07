import { PredictionMarketExchange, MarketFetchParams, EventFetchParams } from '../../src/BaseExchange';
import { UnifiedMarket, UnifiedEvent, MarketOutcome } from '../../src/types';
import { MarketNotFound } from '../../src/errors';

// ---------------------------------------------------------------------------
// Mock exchange for testing loadMarkets caching
// ---------------------------------------------------------------------------

class MockExchange extends PredictionMarketExchange {
    get name() { return 'MockExchange'; }

    public fetchMarketsCallCount = 0;
    private mockMarkets: UnifiedMarket[];

    constructor(markets: UnifiedMarket[] = []) {
        super();
        this.mockMarkets = markets;
    }

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        this.fetchMarketsCallCount++;
        let markets = this.mockMarkets;

        if (params?.marketId) {
            markets = markets.filter(m => m.marketId === params.marketId);
        }
        if (params?.slug) {
            markets = markets.filter(m => m.slug === params.slug);
        }

        return markets;
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Test Data
// ---------------------------------------------------------------------------

const outcome1: MarketOutcome = {
    outcomeId: 'outcome-1',
    marketId: 'market-1',
    label: 'Yes',
    price: 0.5,
};

const market1: UnifiedMarket = {
    marketId: 'market-1',
    title: 'Market One',
    slug: 'market-one',
    outcomes: [outcome1],
    volume24h: 1000,
    liquidity: 500,
    url: 'http://example.com/1',
    description: 'Description 1',
    resolutionDate: new Date(),
    yes: outcome1,
};

const market2: UnifiedMarket = {
    marketId: 'market-2',
    title: 'Market Two',
    // No slug
    outcomes: [],
    volume24h: 2000,
    liquidity: 1000,
    url: 'http://example.com/2',
    description: 'Description 2',
    resolutionDate: new Date(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadMarkets', () => {
    it('should fetch markets and populate cache', async () => {
        const exchange = new MockExchange([market1, market2]);

        expect(exchange.loadedMarkets).toBe(false);
        expect(Object.keys(exchange.markets)).toHaveLength(0);

        const markets = await exchange.loadMarkets();

        expect(exchange.fetchMarketsCallCount).toBe(1);
        expect(exchange.loadedMarkets).toBe(true);
        expect(Object.keys(markets)).toHaveLength(2);
        expect(exchange.markets['market-1']).toBe(market1);
        expect(exchange.markets['market-2']).toBe(market2);
        expect(exchange.marketsBySlug['market-one']).toBe(market1);
    });

    it('should return cached markets on subsequent calls', async () => {
        const exchange = new MockExchange([market1]);

        await exchange.loadMarkets();
        expect(exchange.fetchMarketsCallCount).toBe(1);

        const markets = await exchange.loadMarkets();
        expect(exchange.fetchMarketsCallCount).toBe(1); // Should not increase
        expect(markets['market-1']).toBe(market1);
    });

    it('should force reload when reload=true', async () => {
        const exchange = new MockExchange([market1]);

        await exchange.loadMarkets();
        expect(exchange.fetchMarketsCallCount).toBe(1);

        await exchange.loadMarkets(true);
        expect(exchange.fetchMarketsCallCount).toBe(2);
    });
});

describe('fetchMarket with cache', () => {
    it('should use cache if markets are loaded and marketId is found', async () => {
        const exchange = new MockExchange([market1]);
        await exchange.loadMarkets();
        expect(exchange.fetchMarketsCallCount).toBe(1);

        const market = await exchange.fetchMarket({ marketId: 'market-1' });
        expect(market).toBe(market1);
        expect(exchange.fetchMarketsCallCount).toBe(1); // Should use cache, no new fetch
    });

    it('should use cache if markets are loaded and slug is found', async () => {
        const exchange = new MockExchange([market1]);
        await exchange.loadMarkets();
        expect(exchange.fetchMarketsCallCount).toBe(1);

        const market = await exchange.fetchMarket({ slug: 'market-one' });
        expect(market).toBe(market1);
        expect(exchange.fetchMarketsCallCount).toBe(1); // Should use cache
    });

    it('should fall back to fetchMarkets if not in cache (id)', async () => {
        const exchange = new MockExchange([market1]);
        await exchange.loadMarkets();
        expect(exchange.fetchMarketsCallCount).toBe(1);

        // Requesting a market NOT in the cache (and not in the mock either, basically testing flow)
        // Since mock returns [market1], and we ask for 'market-3', fetchMarket will call fetchMarkets
        // fetchMarkets (mock) returns [market1]
        // Filter logic inside fetchMarket (the part that finds the specific market) is what actually returns the market
        // Wait, BaseExchange.fetchMarket calls `this.fetchMarkets(params)`.
        // The mock `fetchMarketsImpl` ignores params and returns all markets.
        // So checking "fall back" logic depends on what fetchMarket does.

        // BaseExchange.fetchMarket:
        // 1. check cache
        // 2. if not found, await this.fetchMarkets(params)
        // 3. if result empty, throw.

        // So if we request 'market-3', cache miss.
        // It calls this.fetchMarkets({ marketId: 'market-3' }).
        // Mock returns [market1].
        // BaseExchange.fetchMarket returns result[0] i.e. market1.
        // Ideally fetchMarketsImpl should filter, but for this test we primarily want to see
        // if fetchMarketsCallCount increases.

        try {
            await exchange.fetchMarket({ marketId: 'market-3' });
        } catch (error) {
            expect(error).toBeInstanceOf(MarketNotFound);
        }
        expect(exchange.fetchMarketsCallCount).toBe(2);
    });

    it('should fetch if markets are NOT loaded', async () => {
        const exchange = new MockExchange([market1]);
        // modify loadedMarkets manually or just don't call loadMarkets
        expect(exchange.loadedMarkets).toBe(false);

        const market = await exchange.fetchMarket({ marketId: 'market-1' });
        // Since cache is empty, it calls fetchMarkets
        expect(exchange.fetchMarketsCallCount).toBe(1);
        expect(market).toBe(market1);
    });
});
