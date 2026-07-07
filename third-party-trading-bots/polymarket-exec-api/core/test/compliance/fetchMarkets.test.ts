import { exchangeClasses, validateUnifiedMarket, initExchange } from './shared';

describe('Compliance: fetchMarkets', () => {
    test.each(exchangeClasses)('$name should comply with fetchMarkets standards', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchMarkets`);
            const markets = await exchange.fetchMarkets({ limit: 10 });

            expect(markets).toBeDefined();
            expect(Array.isArray(markets)).toBe(true);
            expect(markets!.length).toBeGreaterThan(0);

            // Verify a subset of markets if there are many, or all if few.
            const marketsToTest = markets!.slice(0, 5);
            for (const market of marketsToTest) {
                validateUnifiedMarket(market, name, 'fetch-markets');
            }
        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchMarkets not implemented.`);
                return;
            }
            throw error;
        }
    }, 120000);
});
