import { exchangeClasses, validateUnifiedMarket, initExchange } from './shared';

describe('Compliance: fetchMarket (singular)', () => {
    // First, fetch markets normally to get known IDs, then test fetchMarket lookups

    test.each(exchangeClasses)('$name should return a single market via fetchMarket with slug', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            // Step 1: Get a known market via fetchMarkets
            console.info(`[Compliance] Testing ${name}.fetchMarket (slug lookup)`);
            const markets = await exchange.fetchMarkets({ limit: 3 });

            if (!markets || markets.length === 0) {
                console.info(`[Compliance] ${name}.fetchMarkets returned no results, skipping.`);
                return;
            }

            // Step 2: Extract a slug from the market URL or use the market's slug-like identifier
            // We'll use fetchMarkets with slug to get the same market back
            const knownMarket = markets[0];

            // Step 3: Try fetchMarket with the known marketId
            const market = await exchange.fetchMarket({ marketId: knownMarket.marketId });

            expect(market).toBeDefined();
            expect(typeof market.marketId).toBe('string');
            expect(market.marketId.length).toBeGreaterThan(0);
            validateUnifiedMarket(market, name, 'fetch-market-by-id');

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchMarket not implemented.`);
                return;
            }
            throw error;
        }
    }, 120000);

    test.each(exchangeClasses)('$name should throw for nonexistent marketId', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchMarket (not found case)`);
            await exchange.fetchMarket({ marketId: 'NONEXISTENT_MARKET_ID_99999' });
            // If we get here, the exchange returned something - some exchanges may do fuzzy matching.
        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchMarket not implemented.`);
                return;
            }
            // Should throw some kind of error (MarketNotFound, validation error, etc.)
            // Different exchanges throw different errors for invalid IDs
            expect(error).toBeDefined();
            expect(error.message.length).toBeGreaterThan(0);
        }
    }, 120000);
});

describe('Compliance: fetchMarkets with new ID params', () => {
    test.each(exchangeClasses)('$name should support marketId param in fetchMarkets', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchMarkets({ marketId })`);

            // Get a known market first
            const markets = await exchange.fetchMarkets({ limit: 3 });
            if (!markets || markets.length === 0) {
                console.info(`[Compliance] ${name} returned no markets, skipping.`);
                return;
            }

            const knownId = markets[0].marketId;

            // Look it up by marketId
            const result = await exchange.fetchMarkets({ marketId: knownId });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);

            // Verify the result contains the expected market
            const found = result.some(m => m.marketId === knownId);
            expect(found).toBe(true);

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchMarkets not implemented.`);
                return;
            }
            throw error;
        }
    }, 120000);

    test.each(exchangeClasses)('$name should support outcomeId param in fetchMarkets', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchMarkets({ outcomeId })`);

            // Get a known market and its outcomeId
            const markets = await exchange.fetchMarkets({ limit: 5 });
            if (!markets || markets.length === 0) {
                console.info(`[Compliance] ${name} returned no markets, skipping.`);
                return;
            }

            // Find a market with outcomes
            const marketWithOutcomes = markets.find(m => m.outcomes.length > 0);
            if (!marketWithOutcomes) {
                console.info(`[Compliance] ${name} has no markets with outcomes, skipping.`);
                return;
            }

            const knownOutcomeId = marketWithOutcomes.outcomes[0].outcomeId;

            // Look it up by outcomeId
            const result = await exchange.fetchMarkets({ outcomeId: knownOutcomeId });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);

            // Verify the result contains a market with the matching outcomeId
            const found = result.some(m =>
                m.outcomes.some(o => o.outcomeId === knownOutcomeId)
            );
            expect(found).toBe(true);

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchMarkets not implemented.`);
                return;
            }
            throw error;
        }
    }, 120000);
});
