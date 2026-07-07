import { Throttler } from '../../src/utils/throttler';

describe('Throttler', () => {
    let throttler: Throttler;

    beforeEach(() => {
        throttler = new Throttler({
            refillRate: 1 / 100, // 1 token per 100ms
            capacity: 1,
            delay: 1,
        });
    });

    it('should allow first request immediately', async () => {
        const start = Date.now();
        await throttler.throttle();
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(50); // should be nearly instant
    });

    it('should throttle subsequent requests based on refillRate', async () => {
        // First request should be instant
        await throttler.throttle();

        // Second request should wait ~100ms (at 100ms rate limit)
        const start = Date.now();
        await throttler.throttle();
        const elapsed = Date.now() - start;

        // Allow 50ms tolerance for timing variance
        expect(elapsed).toBeGreaterThanOrEqual(50);
        expect(elapsed).toBeLessThan(150);
    });

    it('should queue multiple requests and process in order', async () => {
        const results: number[] = [];
        const timestamps: number[] = [];

        const start = Date.now();

        // Queue 3 requests without awaiting
        const p1 = throttler.throttle().then(() => {
            results.push(1);
            timestamps.push(Date.now() - start);
        });
        const p2 = throttler.throttle().then(() => {
            results.push(2);
            timestamps.push(Date.now() - start);
        });
        const p3 = throttler.throttle().then(() => {
            results.push(3);
            timestamps.push(Date.now() - start);
        });

        await Promise.all([p1, p2, p3]);

        expect(results).toEqual([1, 2, 3]);
        // Verify they're spaced by at least the rate limit
        expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(80);
        expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(80);
    });

    it('should support custom costs', async () => {
        const throttler2 = new Throttler({
            refillRate: 1 / 50, // 1 token per 50ms
            capacity: 2,
            delay: 1,
        });

        const start = Date.now();

        // First request with cost 1 should be instant
        await throttler2.throttle(1);
        const t1 = Date.now() - start;

        // Second request with cost 2 should wait (need 2 tokens, only have 1)
        await throttler2.throttle(2);
        const t2 = Date.now() - start;

        expect(t1).toBeLessThan(50);
        expect(t2).toBeGreaterThanOrEqual(50); // Must wait to refill
    });

    it('should respect capacity limit and not bank tokens', async () => {
        const throttler2 = new Throttler({
            refillRate: 1 / 50,
            capacity: 1,
            delay: 1,
        });

        const timestamps: number[] = [];
        const start = Date.now();

        // Even if we wait 200ms, we should only have 1 token (capacity), not 4
        await new Promise(resolve => setTimeout(resolve, 200));

        await throttler2.throttle(); // consumes the 1 token
        timestamps.push(Date.now() - start);

        await throttler2.throttle(); // must wait for refill
        timestamps.push(Date.now() - start);

        // Second request should be throttled, not instant
        expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(40);
    });

    it('should handle rapid sequential calls', async () => {
        const throttler2 = new Throttler({
            refillRate: 1 / 20,
            capacity: 1,
            delay: 1,
        });

        const start = Date.now();
        const times: number[] = [];

        for (let i = 0; i < 5; i++) {
            await throttler2.throttle();
            times.push(Date.now() - start);
        }

        // Verify spacing
        for (let i = 1; i < times.length; i++) {
            const gap = times[i] - times[i - 1];
            expect(gap).toBeGreaterThanOrEqual(15); // At least ~20ms minus tolerance
        }
    });
});
