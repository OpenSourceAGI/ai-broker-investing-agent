import { PredictionMarketExchange, EventFetchParams } from '../../src/BaseExchange';

describe('Rate Limiting Configuration', () => {
    class TestExchange extends PredictionMarketExchange {
        get name(): string {
            return 'TestExchange';
        }

        protected async fetchMarketsImpl() {
            return [];
        }

        protected async fetchEventsImpl(_params: EventFetchParams) {
            return [];
        }
    }

    it('should initialize with default rateLimit of 1000ms', () => {
        const exchange = new TestExchange();
        expect(exchange.rateLimit).toBe(1000);
    });

    it('should allow setting custom rate limit', () => {
        const exchange = new TestExchange();
        exchange.rateLimit = 200;
        expect(exchange.rateLimit).toBe(200);
    });

    it('should have enableRateLimit true by default', () => {
        const exchange = new TestExchange();
        expect(exchange.enableRateLimit).toBe(true);
    });

    it('should allow disabling rate limit', () => {
        const exchange = new TestExchange();
        exchange.enableRateLimit = false;
        expect(exchange.enableRateLimit).toBe(false);
    });

    it('should allow different rate limits per instance', () => {
        const exchange1 = new TestExchange();
        const exchange2 = new TestExchange();

        exchange1.rateLimit = 50;
        exchange2.rateLimit = 200;

        expect(exchange1.rateLimit).toBe(50);
        expect(exchange2.rateLimit).toBe(200);
    });

    it('should update rate limit dynamically', () => {
        const exchange = new TestExchange();
        exchange.rateLimit = 100;
        expect(exchange.rateLimit).toBe(100);

        exchange.rateLimit = 50;
        expect(exchange.rateLimit).toBe(50);
    });
});
