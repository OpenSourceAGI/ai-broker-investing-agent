import { UnifiedMarket, MarketOutcome } from '../../src/types';

describe('Type Definitions', () => {
    describe('UnifiedMarket', () => {
        it('should have marketId property', () => {
            const market: UnifiedMarket = {
                marketId: 'test-market-123',
                title: 'Test Market',
                description: 'Test Description',
                outcomes: [],
                resolutionDate: new Date(),
                volume24h: 1000,
                liquidity: 500,
                url: 'https://example.com'
            };

            expect(market.marketId).toBe('test-market-123');
        });
    });

    describe('MarketOutcome', () => {
        it('should have outcomeId property', () => {
            const outcome: MarketOutcome = {
                outcomeId: '12345678901234',
                label: 'Yes',
                price: 0.65
            };

            expect(outcome.outcomeId).toBe('12345678901234');
        });

        it('should support all properties', () => {
            const outcome: MarketOutcome = {
                outcomeId: 'token-123',
                label: 'No',
                price: 0.35,
                priceChange24h: -0.05,
                metadata: {
                    clobTokenId: 'token-123',
                    customField: 'value'
                }
            };

            expect(outcome.label).toBe('No');
            expect(outcome.price).toBe(0.35);
            expect(outcome.priceChange24h).toBe(-0.05);
            expect(outcome.metadata?.clobTokenId).toBe('token-123');
        });
    });
});
