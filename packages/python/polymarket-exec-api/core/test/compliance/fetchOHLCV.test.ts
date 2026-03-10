import { exchangeClasses, validatePriceCandle, initExchange } from './shared';

describe('Compliance: fetchOHLCV', () => {
    test.each(exchangeClasses)('$name should comply with fetchOHLCV standards', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchOHLCV`);

            // 1. Get multiple markets to increase odds of finding one with history
            // Fetch more markets to ensure we find one with volume
            const markets = await exchange.fetchMarkets({ limit: 25 });
            if (!markets || markets.length === 0) {
                throw new Error(`${name}: No markets found to test fetchOHLCV`);
            }

            let candles: any[] = [];
            let lastError: Error | undefined;
            let testedOutcomeId = '';
            let foundData = false;

            // Sort markets by volume (descending) to prioritize active ones
            const activeMarkets = markets.sort((a: any, b: any) => (b.volume || 0) - (a.volume || 0));

            // Iterate through markets until we find meaningful data
            marketLoop:
            for (const market of activeMarkets) {
                // For Limitless, fetchOHLCV expects the market slug (market.id), not outcome ID
                const isLimitless = name.toLowerCase().includes('limitless');

                if (isLimitless) {
                    try {
                        console.info(`[Compliance] ${name}: fetching OHLCV for market ${market.marketId}`);
                        const result = await exchange.fetchOHLCV(market.marketId, {
                            resolution: '1h',
                            limit: 10
                        });

                        if (result && result.length > 0) {
                            candles = result;
                            testedOutcomeId = market.marketId;
                            foundData = true;
                            break marketLoop;
                        }
                    } catch (error: any) {
                        lastError = error;
                    }
                    continue;
                }

                // Try the first few outcomes of each market
                const outcomesToTest = market.outcomes.slice(0, 3);

                for (const outcome of outcomesToTest) {
                    try {
                        console.info(`[Compliance] ${name}: fetching OHLCV for market ${market.marketId} outcome ${outcome.outcomeId}`);
                        const result = await exchange.fetchOHLCV(outcome.outcomeId, {
                            resolution: '1h',
                            limit: 10
                        });

                        if (result && result.length > 0) {
                            candles = result;
                            testedOutcomeId = outcome.outcomeId;
                            foundData = true;
                            break marketLoop;
                        }
                    } catch (error: any) {
                        lastError = error;
                        // Continue searching
                    }
                }
            }

            // Verify candles are returned
            if (!foundData) {
                console.warn(`[Compliance] ${name}: Could not find OHLCV data in ${markets.length} markets. Last Error: ${lastError?.message}`);
            }

            expect(foundData).toBe(true);
            expect(candles).toBeDefined();
            expect(Array.isArray(candles)).toBe(true);
            expect(candles.length).toBeGreaterThan(0);

            // 3. Validate candles
            for (const candle of candles) {
                validatePriceCandle(candle, name, testedOutcomeId);
            }

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchOHLCV not implemented.`);
                return;
            }
            throw error;
        }
    }, 120000); // Increased timeout for market scanning
});
