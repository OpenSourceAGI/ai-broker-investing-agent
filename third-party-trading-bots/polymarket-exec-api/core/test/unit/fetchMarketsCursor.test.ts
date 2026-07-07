import { MarketFetchParams, PredictionMarketExchange, EventFetchParams } from '../../src/BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../src/types';

class CursorTestExchange extends PredictionMarketExchange {
    get name() { return 'CursorTestExchange'; }
    public fetchMarketsImplCalls = 0;
    private readonly mockMarkets: UnifiedMarket[];

    constructor(markets: UnifiedMarket[], snapshotTTL?: number) {
        super(undefined, { snapshotTTL });
        this.mockMarkets = markets;
    }

    protected async fetchMarketsImpl(_params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        this.fetchMarketsImplCalls++;
        return this.mockMarkets;
    }

    protected async fetchEventsImpl(_params: EventFetchParams): Promise<UnifiedEvent[]> {
        return [];
    }
}

function makeMarkets(count: number): UnifiedMarket[] {
    const markets: UnifiedMarket[] = [];
    for (let i = 0; i < count; i++) {
        markets.push({
            marketId: `m-${i}`,
            title: `Market ${i}`,
            description: '',
            outcomes: [],
            resolutionDate: new Date('2030-01-01T00:00:00.000Z'),
            volume24h: i,
            liquidity: i,
            url: `https://example.com/m-${i}`,
        });
    }
    return markets;
}

describe('fetchMarketsPaginated cursor pagination', () => {
    it('should return consistent pages from a snapshot', async () => {
        const exchange = new CursorTestExchange(makeMarkets(6), 60_000);

        const page1 = await exchange.fetchMarketsPaginated({ limit: 2 });
        expect(page1.data.map(m => m.marketId)).toEqual(['m-0', 'm-1']);
        expect(page1.total).toBe(6);
        expect(page1.nextCursor).toBeDefined();
        expect(exchange.fetchMarketsImplCalls).toBe(1);

        const page2 = await exchange.fetchMarketsPaginated({ limit: 2, cursor: page1.nextCursor! });
        expect(page2.data.map(m => m.marketId)).toEqual(['m-2', 'm-3']);
        expect(page2.total).toBe(6);
        expect(page2.nextCursor).toBeDefined();
        // Should not refetch from implementation when cursor is used
        expect(exchange.fetchMarketsImplCalls).toBe(1);

        const page3 = await exchange.fetchMarketsPaginated({ limit: 2, cursor: page2.nextCursor! });
        expect(page3.data.map(m => m.marketId)).toEqual(['m-4', 'm-5']);
        expect(page3.nextCursor).toBeUndefined();
        expect(exchange.fetchMarketsImplCalls).toBe(1);
    });

    it('should return full data with no cursor/limit and no nextCursor', async () => {
        const exchange = new CursorTestExchange(makeMarkets(3), 60_000);
        const result = await exchange.fetchMarketsPaginated();

        expect(result.data).toHaveLength(3);
        expect(result.total).toBe(3);
        expect(result.nextCursor).toBeUndefined();
        expect(exchange.fetchMarketsImplCalls).toBe(1);
    });

    it('should reject expired cursor after TTL', async () => {
        const exchange = new CursorTestExchange(makeMarkets(4), 1);
        const page1 = await exchange.fetchMarketsPaginated({ limit: 2 });
        expect(page1.nextCursor).toBeDefined();

        await new Promise(resolve => setTimeout(resolve, 10));

        await expect(
            exchange.fetchMarketsPaginated({ limit: 2, cursor: page1.nextCursor! })
        ).rejects.toThrow('Cursor has expired');
    });

    it('should keep fetchMarkets non-breaking and return plain arrays', async () => {
        const exchange = new CursorTestExchange(makeMarkets(3), 60_000);
        const markets = await exchange.fetchMarkets({ limit: 2 });

        expect(Array.isArray(markets)).toBe(true);
        expect(markets).toHaveLength(3); // fetchMarketsImpl in mock ignores limit
    });
});
