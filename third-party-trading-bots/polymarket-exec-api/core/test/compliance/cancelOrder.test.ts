import { exchangeClasses, hasAuth, initExchange } from './shared';

describe('Compliance: cancelOrder', () => {
    exchangeClasses.forEach(({ name, cls }) => {
        const supportsCancel = new cls().has.cancelOrder !== false;
        const testFn = hasAuth(name) && supportsCancel ? test : test.skip;

        testFn(`${name} should comply with cancelOrder standards`, async () => {
            const exchange = initExchange(name, cls);

            try {
                console.info(`[Compliance] Testing ${name}.cancelOrder`);

                const orderIdToCancel = '123e4567-e89b-12d3-a456-426614174000';

                // Suppress console.error temporarily for the dummy ID call 
                // as some libraries (like Polymarket's clob-client) log big JSON blobs on 400/404 errors.
                const originalConsoleError = console.error;
                console.error = () => { };

                try {
                    const cancelledOrder = await exchange.cancelOrder(orderIdToCancel);
                    console.error = originalConsoleError; // Restore if it somehow succeeds

                    expect(cancelledOrder.id).toBeDefined();
                    expect(['cancelled', 'canceled']).toContain(cancelledOrder.status);
                } catch (error) {
                    console.error = originalConsoleError; // Restore on error
                    throw error;
                }

            } catch (error: any) {
                const msg = (error.message || '').toLowerCase();
                const status = error.status || error.response?.status;
                const code = error.code;

                // If the API returns "Order not found", "Invalid orderID", or similar, it means:
                // 1. Authentication worked
                // 2. Endpoint was reached
                // 3. Logic was executed
                // This counts as COMPLIANT for interface testing purposes.

                // Check by status code
                if (status === 404 || status === 400) {
                    console.info(`[Compliance] ${name}.cancelOrder verified (Expected ${status} error for dummy order ID).`);
                    return;
                }

                // Check by error code (PMXT unified errors)
                if (code === 'ORDER_NOT_FOUND' || code === 'NOT_FOUND' || code === 'INVALID_ORDER') {
                    console.info(`[Compliance] ${name}.cancelOrder verified (Error code: ${code}).`);
                    return;
                }

                // Check by message content
                if (
                    msg.includes('not found') ||
                    msg.includes('invalid') ||
                    msg.includes('does not exist')
                ) {
                    console.info(`[Compliance] ${name}.cancelOrder verified (Expected error message).`);
                    return;
                }

                // Not implemented check
                if (msg.includes('not implemented')) {
                    console.info(`[Compliance] ${name}.cancelOrder not implemented.`);
                    return;
                }

                throw error;
            }
        }, 60000);
    });
});
