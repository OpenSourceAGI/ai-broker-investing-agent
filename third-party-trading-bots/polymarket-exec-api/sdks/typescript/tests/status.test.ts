
import { Polymarket, Kalshi } from '../index';

describe('SDK Status Parameter Handling', () => {
    it('should allow "status" parameter in fetchMarkets for Polymarket', () => {
        // Compile-time check: ensuring the generated types/wrappers allow 'status'
        const poly = new Polymarket();
        const call = async () => {
            await poly.fetchMarkets({ status: 'closed', limit: 1 });
        };
        // We just ensure the type exists; it will likely fail network-wise in a test env
        expect(call).toBeDefined();
    });

    it('should allow "status" parameter in fetchMarkets for Kalshi', () => {
        const kalshi = new Kalshi();
        const call = async () => {
            await kalshi.fetchMarkets({ status: 'active', limit: 1 });
        };
        expect(call).toBeDefined();
    });
});
