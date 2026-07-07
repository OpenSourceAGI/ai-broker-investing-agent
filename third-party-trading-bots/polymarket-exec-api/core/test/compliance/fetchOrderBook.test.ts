import { exchangeClasses, validateOrderBook, initExchange } from './shared';

describe('Compliance: fetchOrderBook', () => {
    test.each(exchangeClasses)('$name should comply with fetchOrderBook standards', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchOrderBook`);

            // 1. Get a market to find an outcome ID
            const markets = await exchange.fetchMarkets({ limit: 5 });
            if (!markets || markets.length === 0) {
                throw new Error(`${name}: No markets found to test fetchOrderBook`);
            }

            let orderbook: any;
            let testedOutcomeId = '';

            // Try to find an outcome with an orderbook
            const isLimitless = name.toLowerCase().includes('limitless');

            for (const market of markets) {
                // For Limitless, we fetch by market slug (market.marketId)
                if (isLimitless) {
                    try {
                        console.info(`[Compliance] ${name}: fetching orderbook for market ${market.marketId}`);
                        orderbook = await exchange.fetchOrderBook(market.marketId);
                        if (orderbook && (orderbook.bids.length > 0 || orderbook.asks.length > 0)) {
                            testedOutcomeId = market.marketId;
                            break;
                        }
                    } catch (error: any) {
                        console.warn(`[Compliance] ${name}: Failed to fetch orderbook for market ${market.marketId}: ${error.message}`);
                    }
                    continue;
                }

                for (const outcome of market.outcomes) {
                    try {
                        console.info(`[Compliance] ${name}: fetching orderbook for outcome ${outcome.outcomeId} (${outcome.label})`);
                        orderbook = await exchange.fetchOrderBook(outcome.outcomeId);

                        // We need at least some data to validate consistency, but even empty is technically a valid structure
                        // However, for compliance testing, we want to see data if possible.
                        if (orderbook && (orderbook.bids.length > 0 || orderbook.asks.length > 0)) {
                            testedOutcomeId = outcome.outcomeId;
                            break;
                        }
                    } catch (error: any) {
                        console.warn(`[Compliance] ${name}: Failed to fetch orderbook for outcome ${outcome.outcomeId}: ${error.message}`);
                    }
                }
                if (testedOutcomeId) break;
            }

            // If we still don't have an orderbook with data, try the first one we got (even if empty)
            if (!testedOutcomeId && markets.length > 0) {
                const targetId = isLimitless ? markets[0].marketId : (markets[0].outcomes[0]?.outcomeId || '');
                if (targetId) {
                    orderbook = await exchange.fetchOrderBook(targetId);
                    testedOutcomeId = targetId;
                }
            }

            // Verify orderbook is returned
            expect(orderbook).toBeDefined();
            validateOrderBook(orderbook, name, testedOutcomeId);

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchOrderBook not implemented.`);
                return;
            }
            throw error;
        }
    }, 60000);
});
