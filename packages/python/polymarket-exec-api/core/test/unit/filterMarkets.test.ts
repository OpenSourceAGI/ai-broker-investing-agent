import { PolymarketExchange } from '../../src/exchanges/polymarket';
import { UnifiedMarket, UnifiedEvent } from '../../src/types';

describe('filterMarkets', () => {
    let api: PolymarketExchange;
    let mockMarkets: UnifiedMarket[];

    beforeEach(() => {
        api = new PolymarketExchange();

        // Create mock markets for testing
        mockMarkets = [
            {
                id: '1',
                title: 'Will Trump win the 2024 election?',
                description: 'Presidential election market',
                outcomes: [
                    { id: '1a', label: 'Yes', price: 0.55, priceChange24h: 0.05 },
                    { id: '1b', label: 'No', price: 0.45, priceChange24h: -0.05 },
                ],
                resolutionDate: new Date('2024-11-05'),
                volume24h: 50000,
                volume: 500000,
                liquidity: 100000,
                openInterest: 80000,
                url: 'https://example.com/1',
                category: 'Politics',
                tags: ['Election', '2024', 'Presidential'],
                yes: { id: '1a', label: 'Yes', price: 0.55, priceChange24h: 0.05 },
                no: { id: '1b', label: 'No', price: 0.45, priceChange24h: -0.05 },
            },
            {
                id: '2',
                title: 'Will Biden run for reelection?',
                description: 'Democratic primary speculation',
                outcomes: [
                    { id: '2a', label: 'Yes', price: 0.25, priceChange24h: -0.15 },
                    { id: '2b', label: 'No', price: 0.75, priceChange24h: 0.15 },
                ],
                resolutionDate: new Date('2024-06-01'),
                volume24h: 30000,
                volume: 300000,
                liquidity: 50000,
                openInterest: 40000,
                url: 'https://example.com/2',
                category: 'Politics',
                tags: ['Election', 'Democratic'],
                yes: { id: '2a', label: 'Yes', price: 0.25, priceChange24h: -0.15 },
                no: { id: '2b', label: 'No', price: 0.75, priceChange24h: 0.15 },
            },
            {
                id: '3',
                title: 'Bitcoin above $100k by end of year?',
                description: 'Crypto price prediction',
                outcomes: [
                    { id: '3a', label: 'Yes', price: 0.35, priceChange24h: 0.02 },
                    { id: '3b', label: 'No', price: 0.65, priceChange24h: -0.02 },
                ],
                resolutionDate: new Date('2024-12-31'),
                volume24h: 75000,
                volume: 750000,
                liquidity: 150000,
                openInterest: 120000,
                url: 'https://example.com/3',
                category: 'Crypto',
                tags: ['Bitcoin', 'Price'],
                yes: { id: '3a', label: 'Yes', price: 0.35, priceChange24h: 0.02 },
                no: { id: '3b', label: 'No', price: 0.65, priceChange24h: -0.02 },
            },
            {
                id: '4',
                title: 'Will Fed Chair be Kevin Warsh?',
                description: 'Trump Fed Chair nomination',
                outcomes: [
                    { id: '4a', label: 'Yes', price: 0.15, priceChange24h: -0.10 },
                    { id: '4b', label: 'No', price: 0.85, priceChange24h: 0.10 },
                ],
                resolutionDate: new Date('2025-01-20'),
                volume24h: 10000,
                volume: 100000,
                liquidity: 20000,
                openInterest: 15000,
                url: 'https://example.com/4',
                category: 'Politics',
                tags: ['Fed', 'Trump'],
                yes: { id: '4a', label: 'Yes', price: 0.15, priceChange24h: -0.10 },
                no: { id: '4b', label: 'No', price: 0.85, priceChange24h: 0.10 },
            },
        ];
    });

    describe('string search', () => {
        it('should filter by simple string in title', () => {
            const result = api.filterMarkets(mockMarkets, 'Trump');
            expect(result).toHaveLength(1); // Only market 1 has "Trump" in title
            expect(result[0].id).toBe('1');
        });

        it('should be case insensitive', () => {
            const result = api.filterMarkets(mockMarkets, 'bitcoin');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('3');
        });

        it('should return empty array when no matches', () => {
            const result = api.filterMarkets(mockMarkets, 'xyz123notfound');
            expect(result).toHaveLength(0);
        });
    });

    describe('text search with searchIn', () => {
        it('should search in title only by default', () => {
            const result = api.filterMarkets(mockMarkets, {
                text: 'Trump',
            });
            expect(result).toHaveLength(1); // Only market 1 has "Trump" in title
        });

        it('should search in description when specified', () => {
            const result = api.filterMarkets(mockMarkets, {
                text: 'nomination',
                searchIn: ['description'],
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('4');
        });

        it('should search in tags when specified', () => {
            const result = api.filterMarkets(mockMarkets, {
                text: 'Presidential',
                searchIn: ['tags'],
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });

        it('should search in outcomes when specified', () => {
            const result = api.filterMarkets(mockMarkets, {
                text: 'Yes',
                searchIn: ['outcomes'],
            });
            expect(result).toHaveLength(4);
        });

        it('should search in multiple fields', () => {
            const result = api.filterMarkets(mockMarkets, {
                text: 'Trump',
                searchIn: ['title', 'description', 'tags'],
            });
            expect(result).toHaveLength(2);
        });

        it('should search in category when specified', () => {
            const result = api.filterMarkets(mockMarkets, {
                text: 'Politics',
                searchIn: ['category'],
            });
            expect(result).toHaveLength(3);
        });
    });

    describe('volume filtering', () => {
        it('should filter by minimum volume24h', () => {
            const result = api.filterMarkets(mockMarkets, {
                volume24h: { min: 40000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('3');
        });

        it('should filter by maximum volume24h', () => {
            const result = api.filterMarkets(mockMarkets, {
                volume24h: { max: 35000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('2');
            expect(result.map(m => m.id)).toContain('4');
        });

        it('should filter by volume24h range', () => {
            const result = api.filterMarkets(mockMarkets, {
                volume24h: { min: 25000, max: 60000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('2');
        });

        it('should filter by total volume', () => {
            const result = api.filterMarkets(mockMarkets, {
                volume: { min: 400000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('3');
        });
    });

    describe('liquidity filtering', () => {
        it('should filter by minimum liquidity', () => {
            const result = api.filterMarkets(mockMarkets, {
                liquidity: { min: 75000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('3');
        });

        it('should filter by maximum liquidity', () => {
            const result = api.filterMarkets(mockMarkets, {
                liquidity: { max: 60000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('2');
            expect(result.map(m => m.id)).toContain('4');
        });

        it('should filter by liquidity range', () => {
            const result = api.filterMarkets(mockMarkets, {
                liquidity: { min: 40000, max: 120000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('2');
        });
    });

    describe('openInterest filtering', () => {
        it('should filter by minimum openInterest', () => {
            const result = api.filterMarkets(mockMarkets, {
                openInterest: { min: 70000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('3');
        });

        it('should filter by maximum openInterest', () => {
            const result = api.filterMarkets(mockMarkets, {
                openInterest: { max: 50000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('2');
            expect(result.map(m => m.id)).toContain('4');
        });
    });

    describe('date filtering', () => {
        it('should filter by resolutionDate before', () => {
            const result = api.filterMarkets(mockMarkets, {
                resolutionDate: { before: new Date('2024-12-01') },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('2');
        });

        it('should filter by resolutionDate after', () => {
            const result = api.filterMarkets(mockMarkets, {
                resolutionDate: { after: new Date('2024-07-01') },
            });
            expect(result).toHaveLength(3); // Markets 1, 3, 4 all after 2024-07-01
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('3');
            expect(result.map(m => m.id)).toContain('4');
        });

        it('should filter by resolutionDate range', () => {
            const result = api.filterMarkets(mockMarkets, {
                resolutionDate: {
                    after: new Date('2024-01-01'),
                    before: new Date('2024-12-01'),
                },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('2');
        });
    });

    describe('category filtering', () => {
        it('should filter by exact category', () => {
            const result = api.filterMarkets(mockMarkets, {
                category: 'Politics',
            });
            expect(result).toHaveLength(3);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('2');
            expect(result.map(m => m.id)).toContain('4');
        });

        it('should return empty for non-existent category', () => {
            const result = api.filterMarkets(mockMarkets, {
                category: 'Sports',
            });
            expect(result).toHaveLength(0);
        });
    });

    describe('tags filtering', () => {
        it('should filter by single tag', () => {
            const result = api.filterMarkets(mockMarkets, {
                tags: ['Election'],
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('2');
        });

        it('should filter by multiple tags (OR logic)', () => {
            const result = api.filterMarkets(mockMarkets, {
                tags: ['Bitcoin', 'Fed'],
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('3');
            expect(result.map(m => m.id)).toContain('4');
        });

        it('should be case insensitive', () => {
            const result = api.filterMarkets(mockMarkets, {
                tags: ['bitcoin'],
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('3');
        });
    });

    describe('price filtering', () => {
        it('should filter by yes price max', () => {
            const result = api.filterMarkets(mockMarkets, {
                price: { outcome: 'yes', max: 0.3 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('2');
            expect(result.map(m => m.id)).toContain('4');
        });

        it('should filter by yes price min', () => {
            const result = api.filterMarkets(mockMarkets, {
                price: { outcome: 'yes', min: 0.3 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('3');
        });

        it('should filter by yes price range', () => {
            const result = api.filterMarkets(mockMarkets, {
                price: { outcome: 'yes', min: 0.2, max: 0.4 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('2');
            expect(result.map(m => m.id)).toContain('3');
        });

        it('should filter by no price', () => {
            const result = api.filterMarkets(mockMarkets, {
                price: { outcome: 'no', min: 0.7 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('2');
            expect(result.map(m => m.id)).toContain('4');
        });
    });

    describe('priceChange24h filtering', () => {
        it('should filter by negative price change (drops)', () => {
            const result = api.filterMarkets(mockMarkets, {
                priceChange24h: { outcome: 'yes', max: -0.08 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('2');
            expect(result.map(m => m.id)).toContain('4');
        });

        it('should filter by positive price change (gains)', () => {
            const result = api.filterMarkets(mockMarkets, {
                priceChange24h: { outcome: 'yes', min: 0.03 },
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });

        it('should filter by price change range', () => {
            const result = api.filterMarkets(mockMarkets, {
                priceChange24h: { outcome: 'yes', min: -0.06, max: 0.03 },
            });
            expect(result).toHaveLength(1); // Only market 3 (0.02) is in range, market 1 (0.05) exceeds max
            expect(result[0].id).toBe('3');
        });
    });

    describe('combined filters', () => {
        it('should combine text and volume filters', () => {
            const result = api.filterMarkets(mockMarkets, {
                text: 'Trump',
                volume24h: { min: 20000 },
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });

        it('should combine category, volume, and price filters', () => {
            const result = api.filterMarkets(mockMarkets, {
                category: 'Politics',
                volume24h: { min: 25000 },
                price: { outcome: 'yes', max: 0.6 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('2');
        });

        it('should combine multiple filters (complex query)', () => {
            const result = api.filterMarkets(mockMarkets, {
                text: 'election',
                searchIn: ['title', 'tags'],
                category: 'Politics',
                volume24h: { min: 40000 },
                liquidity: { min: 90000 },
                resolutionDate: { before: new Date('2025-01-01') },
                price: { outcome: 'yes', min: 0.5 },
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });
    });

    describe('predicate function', () => {
        it('should filter using custom predicate', () => {
            const result = api.filterMarkets(mockMarkets, m => m.volume24h > 40000);
            expect(result).toHaveLength(2);
            expect(result.map(m => m.id)).toContain('1');
            expect(result.map(m => m.id)).toContain('3');
        });

        it('should filter by complex custom logic', () => {
            const result = api.filterMarkets(
                mockMarkets,
                m =>
                    m.category === 'Politics' &&
                    m.outcomes.some(o => o.price < 0.3) &&
                    m.volume24h > 10000 // Market 4 has exactly 10000, not > 10000
            );
            expect(result).toHaveLength(1); // Only market 2 matches (volume24h 30000 > 10000)
            expect(result[0].id).toBe('2');
        });

        it('should handle outcome-level filtering', () => {
            const result = api.filterMarkets(mockMarkets, m =>
                m.outcomes.some(o => o.price > 0.8 && o.priceChange24h > 0.08)
            );
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('4');
        });
    });

    describe('edge cases', () => {
        it('should return all markets with empty criteria object', () => {
            const result = api.filterMarkets(mockMarkets, {});
            expect(result).toHaveLength(4);
        });

        it('should handle empty markets array', () => {
            const result = api.filterMarkets([], 'Trump');
            expect(result).toHaveLength(0);
        });

        it('should handle markets without optional fields', () => {
            const sparseMarket: UnifiedMarket = {
                id: '5',
                title: 'Sparse Market',
                description: 'Has minimal fields',
                outcomes: [{ id: '5a', label: 'Yes', price: 0.5 }],
                resolutionDate: new Date('2025-01-01'),
                volume24h: 1000,
                liquidity: 500,
                url: 'https://example.com/5',
            };

            const result = api.filterMarkets([sparseMarket], {
                volume: { min: 100 },
                openInterest: { min: 100 },
            });
            expect(result).toHaveLength(0); // openInterest is undefined, treated as 0
        });

        it('should handle markets without yes/no convenience accessors', () => {
            const marketWithoutYesNo: UnifiedMarket = {
                id: '6',
                title: 'Multi-outcome Market',
                description: 'No yes/no',
                outcomes: [
                    { id: '6a', label: 'Option A', price: 0.3 },
                    { id: '6b', label: 'Option B', price: 0.4 },
                    { id: '6c', label: 'Option C', price: 0.3 },
                ],
                resolutionDate: new Date('2025-01-01'),
                volume24h: 5000,
                liquidity: 2000,
                url: 'https://example.com/6',
            };

            const result = api.filterMarkets([marketWithoutYesNo], {
                price: { outcome: 'yes', max: 0.5 },
            });
            expect(result).toHaveLength(0); // no yes outcome
        });
    });
});
