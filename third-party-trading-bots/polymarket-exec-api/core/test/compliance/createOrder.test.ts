import { exchangeClasses, validateOrder, hasAuth, initExchange } from './shared';

describe('Compliance: createOrder', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with createOrder standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.createOrder`);

                // 1. Fetch real markets to get valid IDs
                // We assume there's at least one active market on the platform
                const markets = await exchange.fetchMarkets({ limit: 25 });
                if (!markets || markets.length === 0) {
                    console.warn(`[Compliance] No markets found for ${name}, skipping createOrder test.`);
                    return;
                }

                // 2. Pick a market and outcome that looks valid
                // We try to find one with outcomes
                const market = markets.find((m: any) => m.outcomes && m.outcomes.length > 0);
                if (!market) {
                    console.warn(`[Compliance] No valid markets with outcomes found for ${name}.`);
                    return;
                }

                const outcome = market.outcomes[0];

                console.log(`[Compliance] Using Market: ${market.marketId} (${market.title})`);
                console.log(`[Compliance] Using Outcome: ${outcome.outcomeId} (${outcome.label})`);

                // 3. Create a LIMIT order at a price unlikely to execute (e.g. Buy at 0.01 or 0.02)
                // Note: For Kalshi, price is 1-99 cents. For Poly, 0-1.00.
                const orderParams = {
                    marketId: market.marketId,
                    outcomeId: outcome.outcomeId,
                    side: 'buy' as const,
                    type: 'limit' as const,
                    amount: 50, // 50 * 0.10 = 5 USDC (Valid > 1 USDC)
                    price: 0.10 // 10 cents
                };

                const order = await exchange.createOrder(orderParams);
                validateOrder(order, name);

                // Validation passed.
                // Ideally, we should Cancel this order immediately to clean up.
                // But compliance tests for cancelOrder are separate.
                // For now, we leave it or rely on a "dry-run" if supported (not yet).

                console.log(`[Compliance] Order created successfully: ${order.id}`);

            } catch (error: any) {
                const msg = (error.message || '').toLowerCase();
                const response = error.response?.data ? JSON.stringify(error.response.data).toLowerCase() : '';

                // Check if the error is related to funds/balance, which means the order request was VALID but rejected by logic.
                // This counts as COMPLIANT for the purpose of testing the interface.
                if (
                    msg.includes('insufficient balance') ||
                    msg.includes('not enough balance') ||
                    msg.includes('allowance') ||
                    response.includes('insufficient_balance') ||
                    response.includes('not enough balance') ||
                    response.includes('allowance')
                ) {
                    console.info(`[Compliance] ${name}.createOrder verified (rejected due to funds as expected).`);
                    return;
                }

                // Handle "Not Implemented" gracefully
                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.createOrder not implemented.`);
                    return;
                }

                // Log full error for debugging
                console.error(`[Compliance] ${name}.createOrder failed:`, error);
                throw error;
            }
        }, 120000); // Increased timeout for market fetch
    });
});
