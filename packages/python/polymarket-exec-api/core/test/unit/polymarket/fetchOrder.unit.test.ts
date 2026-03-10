import { PolymarketExchange } from '../../../src/exchanges/polymarket';

describe('PolymarketExchange: fetchOrder Unit Test', () => {
    let exchange: PolymarketExchange;

    beforeEach(() => {
        exchange = new PolymarketExchange({
            privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001'
        });
    });

    it('should correctly map a successful Polymarket order response', async () => {
        const mockOrder = {
            id: '0x123',
            market: 'test-market',
            asset_id: '0xabc',
            side: 'BUY',
            order_type: 'GTC',
            price: '0.5',
            original_size: '100',
            size_matched: '40',
            status: 'OPEN',
            created_at: 1700000000
        };

        // Mock the getOrder method on the clob client
        const getOrderMock = jest.fn().mockResolvedValue(mockOrder);

        // Inject mock into protected/private auth/client flow
        // For unit testing, we override the getClobClient internal call or the fetchOrder itself
        (exchange as any).ensureAuth = () => ({
            getClobClient: () => Promise.resolve({
                getOrder: getOrderMock
            })
        });

        const unifiedOrder = await exchange.fetchOrder('0x123');

        expect(unifiedOrder.id).toBe('0x123');
        expect(unifiedOrder.side).toBe('buy');
        expect(unifiedOrder.price).toBe(0.5);
        expect(unifiedOrder.amount).toBe(100);
        expect(unifiedOrder.filled).toBe(40);
        expect(unifiedOrder.remaining).toBe(60);
        expect(unifiedOrder.timestamp).toBe(1700000000000);
    });
});
