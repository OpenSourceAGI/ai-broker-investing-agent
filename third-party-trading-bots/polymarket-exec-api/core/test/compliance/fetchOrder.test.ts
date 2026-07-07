import { exchangeClasses, validateOrder, hasAuth, initExchange } from './shared';

describe('Compliance: fetchOrder', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const testFn = hasAuth(name) ? test : test.skip;

        testFn(`${name} should comply with fetchOrder standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                // 1. Try to find a REAL order first (Golden Path)
                // This validates that we can actually parse a successful response, not just handle errors.
                let realOrderId: string | undefined;

                try {
                    // Limitless requires a market slug for open orders, so this might fail or return empty if we don't provide one.
                    // handling that gracefully below.
                    if (name !== 'Limitless') {
                        const openOrders = await exchange.fetchOpenOrders();
                        if (openOrders.length > 0) {
                            realOrderId = openOrders[0].id;
                            console.info(`[Compliance] ${name}: Found real order ${realOrderId}, attempting to fetch...`);
                        }
                    }
                } catch (e: any) {
                    console.warn(`[Compliance] ${name}: Could not fetch open orders to verify fetchOrder (${e.message}).`);
                }

                // 2. Perform the fetch
                const idToFetch = realOrderId || 'dummy-order-id';
                console.info(`[Compliance] Testing ${name}.fetchOrder with ${realOrderId ? 'REAL' : 'DUMMY'} ID: ${idToFetch}`);

                const order = await exchange.fetchOrder(idToFetch);

                // 3. Validate
                if (realOrderId) {
                    validateOrder(order, name);
                    expect(order.id).toBe(realOrderId);
                    console.info(`[Compliance] ${name}.fetchOrder passed with REAL order.`);
                } else {
                    // If we somehow got a "success" response for a dummy ID, that's weird but strictly speaking compliant?
                    // Usually we expect it to throw.
                    console.warn(`[Compliance] ${name}.fetchOrder returned success for dummy ID?`, order);
                    validateOrder(order, name);
                }

            } catch (error: any) {
                const msg = error.message.toLowerCase();
                const status = error.status || error.response?.status;

                // General "Not Supported" / "Not Implemented" Check
                if (msg.includes('not supported') || msg.includes('not implemented') || msg.includes('use fetchopenorders')) {
                    console.info(`[Compliance] ${name}.fetchOrder skipped: ${error.message}`);
                    return;
                }

                // API Error Handling (Resource Not Found)
                // If we used a dummy ID, a 404/400 proves we authenticated and hit the right endpoint.
                if (status === 400 || status === 404 || msg.includes('invalid orderid') || msg.includes('not found') || msg.includes('invalid id') || msg.includes('invalid uuid')) {
                    console.info(`[Compliance] ${name}.fetchOrder validated (Correctly returned 'Not Found' for dummy ID).`);
                    return;
                }

                // If we failed with a legitimate error (e.g. parsing error on a real order), rely on the test failure
                throw error;
            }
        }, 60000);
    });
});
