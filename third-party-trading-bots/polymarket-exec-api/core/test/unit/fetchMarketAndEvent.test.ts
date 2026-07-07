import { PredictionMarketExchange, MarketFetchParams, EventFetchParams } from '../../src/BaseExchange';
import { UnifiedMarket, UnifiedEvent } from '../../src/types';
import { MarketNotFound, EventNotFound } from '../../src/errors';

// ---------------------------------------------------------------------------
// Minimal concrete exchange for testing the base class logic
// ---------------------------------------------------------------------------

class MockExchange extends PredictionMarketExchange {
    get name() { return 'MockExchange'; }

    private mockMarkets: UnifiedMarket[];
    private mockEvents: UnifiedEvent[];

    constructor(markets: UnifiedMarket[] = [], events: UnifiedEvent[] = []) {
        super();
        this.mockMarkets = markets;
        this.mockEvents = events;
    }

    protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        return this.mockMarkets;
    }

    protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        return this.mockEvents;
    }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleOutcome = {
    outcomeId: 'outcome-1',
    marketId: 'market-1',
    label: 'Yes',
    price: 0.65,
    priceChange24h: 0.02,
};

const sampleMarket: UnifiedMarket = {
    marketId: 'market-1',
    title: 'Will it rain tomorrow?',
    outcomes: [sampleOutcome],
    volume24h: 50000,
    liquidity: 10000,
    url: 'https://example.com/market/1',
    description: 'A test market',
    resolutionDate: new Date('2025-12-31'),
    yes: sampleOutcome,
};

const sampleEvent: UnifiedEvent = {
    id: 'event-1',
    title: 'Weather Event',
    description: 'Weather-related markets',
    slug: 'weather-event',
    markets: [sampleMarket],
    url: 'https://example.com/event/1',
    category: 'Weather',
    tags: ['weather'],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventNotFound error class', () => {
    it('should have correct properties', () => {
        const error = new EventNotFound('event-123', 'TestExchange');
        expect(error.status).toBe(404);
        expect(error.code).toBe('EVENT_NOT_FOUND');
        expect(error.message).toBe('Event not found: event-123');
        expect(error.retryable).toBe(false);
        expect(error.exchange).toBe('TestExchange');
    });

    it('should work without exchange parameter', () => {
        const error = new EventNotFound('event-456');
        expect(error.message).toBe('Event not found: event-456');
        expect(error.exchange).toBeUndefined();
    });

    it('should be instanceof Error and BaseError', () => {
        const error = new EventNotFound('test');
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('EventNotFound');
    });
});

describe('fetchMarket (singular)', () => {
    it('should return the first market when results exist', async () => {
        const exchange = new MockExchange([sampleMarket]);
        const market = await exchange.fetchMarket();
        expect(market).toBe(sampleMarket);
        expect(market.marketId).toBe('market-1');
    });

    it('should throw MarketNotFound when no markets match', async () => {
        const exchange = new MockExchange([]);

        await expect(exchange.fetchMarket({ marketId: 'nonexistent' }))
            .rejects.toThrow(MarketNotFound);

        try {
            await exchange.fetchMarket({ marketId: 'nonexistent' });
        } catch (error: any) {
            expect(error).toBeInstanceOf(MarketNotFound);
            expect(error.status).toBe(404);
            expect(error.code).toBe('MARKET_NOT_FOUND');
            expect(error.message).toContain('nonexistent');
            expect(error.exchange).toBe('MockExchange');
        }
    });

    it('should use slug as identifier in error when marketId is not provided', async () => {
        const exchange = new MockExchange([]);

        try {
            await exchange.fetchMarket({ slug: 'my-slug' });
        } catch (error: any) {
            expect(error.message).toContain('my-slug');
        }
    });

    it('should use outcomeId as identifier in error', async () => {
        const exchange = new MockExchange([]);

        try {
            await exchange.fetchMarket({ outcomeId: 'outcome-xyz' });
        } catch (error: any) {
            expect(error.message).toContain('outcome-xyz');
        }
    });

    it('should use eventId as identifier in error', async () => {
        const exchange = new MockExchange([]);

        try {
            await exchange.fetchMarket({ eventId: 'event-abc' });
        } catch (error: any) {
            expect(error.message).toContain('event-abc');
        }
    });

    it('should use query as identifier in error', async () => {
        const exchange = new MockExchange([]);

        try {
            await exchange.fetchMarket({ query: 'Trump' });
        } catch (error: any) {
            expect(error.message).toContain('Trump');
        }
    });

    it('should pass params through to fetchMarkets', async () => {
        let receivedParams: MarketFetchParams | undefined;

        class SpyExchange extends PredictionMarketExchange {
            get name() { return 'SpyExchange'; }
            protected async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
                receivedParams = params;
                return [sampleMarket];
            }
        }

        const exchange = new SpyExchange();
        await exchange.fetchMarket({ marketId: 'test-id', limit: 5 });

        expect(receivedParams).toBeDefined();
        expect(receivedParams!.marketId).toBe('test-id');
        expect(receivedParams!.limit).toBe(5);
    });
});

describe('fetchEvent (singular)', () => {
    it('should return the first event when results exist', async () => {
        const exchange = new MockExchange([], [sampleEvent]);
        const event = await exchange.fetchEvent({ eventId: 'event-1' });
        expect(event).toBe(sampleEvent);
        expect(event.id).toBe('event-1');
    });

    it('should throw EventNotFound when no events match', async () => {
        const exchange = new MockExchange([], []);

        await expect(exchange.fetchEvent({ eventId: 'nonexistent' }))
            .rejects.toThrow(EventNotFound);

        try {
            await exchange.fetchEvent({ eventId: 'nonexistent' });
        } catch (error: any) {
            expect(error).toBeInstanceOf(EventNotFound);
            expect(error.status).toBe(404);
            expect(error.code).toBe('EVENT_NOT_FOUND');
            expect(error.message).toContain('nonexistent');
            expect(error.exchange).toBe('MockExchange');
        }
    });

    it('should use slug as identifier in error when eventId not provided', async () => {
        const exchange = new MockExchange([], []);

        try {
            await exchange.fetchEvent({ slug: 'my-event-slug' });
        } catch (error: any) {
            expect(error.message).toContain('my-event-slug');
        }
    });

    it('should use query as identifier in error', async () => {
        const exchange = new MockExchange([], []);

        try {
            await exchange.fetchEvent({ query: 'Election' });
        } catch (error: any) {
            expect(error.message).toContain('Election');
        }
    });

    it('should pass params through to fetchEvents', async () => {
        let receivedParams: EventFetchParams | undefined;

        class SpyExchange extends PredictionMarketExchange {
            get name() { return 'SpyExchange'; }
            protected async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
                receivedParams = params;
                return [sampleEvent];
            }
        }

        const exchange = new SpyExchange();
        await exchange.fetchEvent({ eventId: 'test-id', limit: 5 });

        expect(receivedParams).toBeDefined();
        expect(receivedParams!.eventId).toBe('test-id');
        expect(receivedParams!.limit).toBe(5);
    });
});

describe('fetchEvents no required params', () => {
    it('should accept eventId without query', async () => {
        const exchange = new MockExchange([], [sampleEvent]);
        const events = await exchange.fetchEvents({ eventId: 'event-1' });
        expect(events).toHaveLength(1);
    });

    it('should accept slug without query', async () => {
        const exchange = new MockExchange([], [sampleEvent]);
        const events = await exchange.fetchEvents({ slug: 'weather-event' });
        expect(events).toHaveLength(1);
    });

    it('should resolve with empty params object (returns default list)', async () => {
        const exchange = new MockExchange([], [sampleEvent]);
        const events = await exchange.fetchEvents({});
        expect(Array.isArray(events)).toBe(true);
    });

    it('should resolve with no params (returns default list)', async () => {
        const exchange = new MockExchange([], [sampleEvent]);
        const events = await exchange.fetchEvents();
        expect(Array.isArray(events)).toBe(true);
    });

    it('should still work with query parameter (backwards compatible)', async () => {
        const exchange = new MockExchange([], [sampleEvent]);
        const events = await exchange.fetchEvents({ query: 'Weather' });
        expect(events).toHaveLength(1);
    });
});

describe('MarketFilterParams new fields', () => {
    it('should accept marketId parameter', () => {
        const params: MarketFetchParams = { marketId: 'test-123' };
        expect(params.marketId).toBe('test-123');
    });

    it('should accept outcomeId parameter', () => {
        const params: MarketFetchParams = { outcomeId: 'outcome-456' };
        expect(params.outcomeId).toBe('outcome-456');
    });

    it('should accept eventId parameter', () => {
        const params: MarketFetchParams = { eventId: 'event-789' };
        expect(params.eventId).toBe('event-789');
    });

    it('should be backwards compatible with existing fields', () => {
        const params: MarketFetchParams = {
            query: 'Trump',
            slug: 'trump-market',
            limit: 10,
            offset: 0,
            sort: 'volume',
            status: 'active',
            searchIn: 'title',
        };
        expect(params.query).toBe('Trump');
        expect(params.slug).toBe('trump-market');
    });
});

describe('EventFetchParams new fields', () => {
    it('should accept eventId parameter', () => {
        const params: EventFetchParams = { eventId: 'event-123' };
        expect(params.eventId).toBe('event-123');
    });

    it('should accept slug parameter', () => {
        const params: EventFetchParams = { slug: 'my-event' };
        expect(params.slug).toBe('my-event');
    });

    it('should be backwards compatible with existing fields', () => {
        const params: EventFetchParams = {
            query: 'Election',
            limit: 10,
            offset: 0,
            status: 'active',
            searchIn: 'title',
        };
        expect(params.query).toBe('Election');
    });
});
