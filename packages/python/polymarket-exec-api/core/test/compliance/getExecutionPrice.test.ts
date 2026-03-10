import { exchangeClasses, initExchange } from './shared';
import { OrderBook } from '../../src/types';

describe('Compliance: getExecutionPrice', () => {
    test.each(exchangeClasses)('$name should comply with getExecutionPrice standards', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.getExecutionPrice`);

            // 1. Get a market to find an outcome ID
            const markets = await exchange.fetchMarkets({ limit: 5 });
            if (!markets || markets.length === 0) {
                throw new Error(`${name}: No markets found to test getExecutionPrice`);
            }

            let orderbook: OrderBook | undefined;
            let testedOutcomeId = '';

            // Try to find an outcome with an orderbook
            for (const market of markets) {
                for (const outcome of market.outcomes) {
                    try {
                        const ob = await exchange.fetchOrderBook(outcome.outcomeId);
                        if (ob && (ob.bids.length > 0 || ob.asks.length > 0)) {
                            orderbook = ob;
                            testedOutcomeId = outcome.outcomeId;
                            break;
                        }
                    } catch (error) {
                        // Skip failed orderbook fetches
                    }
                }
                if (orderbook) break;
            }

            if (!orderbook) {
                // If no orderbook with data found, use an empty one or skip if impossible
                // For getExecutionPrice, an empty book is a valid test case but we'd prefer one with data
                const firstOutcome = markets[0].outcomes[0];
                orderbook = await exchange.fetchOrderBook(firstOutcome.outcomeId);
            }

            // 2. Test getExecutionPrice (Simple)
            if (orderbook.asks.length > 0) {
                const bestAsk = orderbook.asks[0];
                const price = exchange.getExecutionPrice(orderbook, 'buy', bestAsk.size / 2);
                expect(typeof price).toBe('number');
                expect(price).toBeCloseTo(bestAsk.price, 8);
            }

            if (orderbook.bids.length > 0) {
                const bestBid = orderbook.bids[0];
                const price = exchange.getExecutionPrice(orderbook, 'sell', bestBid.size / 2);
                expect(typeof price).toBe('number');
                expect(price).toBeCloseTo(bestBid.price, 8);
            }

            // 3. Test getExecutionPriceDetailed
            const amount = 1.0; // Test with 1 unit
            const detailed = exchange.getExecutionPriceDetailed(orderbook, 'buy', amount);

            expect(detailed).toBeDefined();
            expect(typeof detailed.price).toBe('number');
            expect(typeof detailed.filledAmount).toBe('number');
            expect(typeof detailed.fullyFilled).toBe('boolean');

            // Consistency check
            const simplePrice = exchange.getExecutionPrice(orderbook, 'buy', amount);
            if (detailed.fullyFilled) {
                expect(simplePrice).toBe(detailed.price);
            } else {
                expect(simplePrice).toBe(0);
            }

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.getExecutionPrice not implemented.`);
                return;
            }
            throw error;
        }
    }, 60000);
});
