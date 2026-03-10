import { exchangeClasses, validateOrder, hasAuth, initExchange } from './shared';

describe('Compliance: fetchAllOrders', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with fetchAllOrders standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.fetchAllOrders`);

                const orders = await exchange.fetchAllOrders({ limit: 25 });

                expect(Array.isArray(orders)).toBe(true);

                for (const order of orders) {
                    validateOrder(order, name);
                }

            } catch (error: any) {
                const msg = error.message?.toLowerCase() ?? '';
                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.fetchAllOrders not implemented.`);
                    return;
                }
                throw error;
            }
        }, 60000);
    });
});
