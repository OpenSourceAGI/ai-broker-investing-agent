import { PolymarketExchange } from '../../src/exchanges/polymarket';
import { UnifiedEvent, UnifiedMarket } from '../../src/types';

describe('filterEvents', () => {
    let api: PolymarketExchange;
    let mockEvents: UnifiedEvent[];

    beforeEach(() => {
        api = new PolymarketExchange();

        // Create mock events for testing
        const createMarket = (
            id: string,
            title: string,
            volume24h: number
        ): UnifiedMarket => ({
            id,
            title,
            description: 'Market description',
            outcomes: [
                { id: `${id}a`, label: 'Yes', price: 0.5 },
                { id: `${id}b`, label: 'No', price: 0.5 },
            ],
            resolutionDate: new Date('2025-01-01'),
            volume24h,
            liquidity: 10000,
            url: `https://example.com/${id}`,
            yes: { id: `${id}a`, label: 'Yes', price: 0.5 },
            no: { id: `${id}b`, label: 'No', price: 0.5 },
        });

        mockEvents = [
            {
                id: '1',
                title: '2024 Presidential Election',
                description: 'Markets related to 2024 US presidential election',
                slug: '2024-presidential-election',
                url: 'https://example.com/event/1',
                category: 'Politics',
                tags: ['Election', 'Presidential', '2024'],
                markets: [
                    createMarket('1a', 'Trump wins', 50000),
                    createMarket('1b', 'Biden wins', 40000),
                    createMarket('1c', 'Other wins', 10000),
                ],
            },
            {
                id: '2',
                title: 'Trump Cabinet Nominations',
                description: 'Who will Trump nominate for key positions?',
                slug: 'trump-cabinet-nominations',
                url: 'https://example.com/event/2',
                category: 'Politics',
                tags: ['Trump', 'Cabinet'],
                markets: [
                    createMarket('2a', 'Kevin Warsh as Fed Chair', 15000),
                    createMarket('2b', 'Marco Rubio as Secretary of State', 20000),
                    createMarket('2c', 'Scott Bessent as Treasury Secretary', 18000),
                    createMarket('2d', 'Robert Lighthizer as Trade Rep', 12000),
                    createMarket('2e', 'Stephen Miller as Chief of Staff', 10000),
                ],
            },
            {
                id: '3',
                title: 'Crypto Price Predictions 2024',
                description: 'Cryptocurrency price targets for end of year',
                slug: 'crypto-prices-2024',
                url: 'https://example.com/event/3',
                category: 'Crypto',
                tags: ['Bitcoin', 'Ethereum', 'Price'],
                markets: [
                    createMarket('3a', 'Bitcoin above $100k', 80000),
                    createMarket('3b', 'Ethereum above $5k', 60000),
                ],
            },
            {
                id: '4',
                title: 'Fed Rate Decisions',
                description: 'Federal Reserve interest rate predictions',
                slug: 'fed-rate-decisions',
                url: 'https://example.com/event/4',
                category: 'Economics',
                tags: ['Fed', 'Interest Rates'],
                markets: [createMarket('4a', 'Rate cut in January', 25000)],
            },
        ];
    });

    describe('string search', () => {
        it('should filter by simple string in title', () => {
            const result = api.filterEvents(mockEvents, 'Trump');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });

        it('should be case insensitive', () => {
            const result = api.filterEvents(mockEvents, 'election');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });

        it('should return empty array when no matches', () => {
            const result = api.filterEvents(mockEvents, 'xyz123notfound');
            expect(result).toHaveLength(0);
        });

        it('should match partial words', () => {
            const result = api.filterEvents(mockEvents, 'Crypto');
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('3');
        });
    });

    describe('text search with searchIn', () => {
        it('should search in title only by default', () => {
            const result = api.filterEvents(mockEvents, {
                text: 'Trump',
            });
            expect(result).toHaveLength(1);
        });

        it('should search in description when specified', () => {
            const result = api.filterEvents(mockEvents, {
                text: 'nominate',
                searchIn: ['description'],
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });

        it('should search in tags when specified', () => {
            const result = api.filterEvents(mockEvents, {
                text: 'Presidential',
                searchIn: ['tags'],
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });

        it('should search in multiple fields', () => {
            const result = api.filterEvents(mockEvents, {
                text: 'Trump',
                searchIn: ['title', 'description', 'tags'],
            });
            expect(result).toHaveLength(1); // Only event 2 has "Trump" in title
            expect(result[0].id).toBe('2');
        });

        it('should search in category when specified', () => {
            const result = api.filterEvents(mockEvents, {
                text: 'Politics',
                searchIn: ['category'],
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('2');
        });
    });

    describe('category filtering', () => {
        it('should filter by exact category', () => {
            const result = api.filterEvents(mockEvents, {
                category: 'Politics',
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('2');
        });

        it('should return empty for non-existent category', () => {
            const result = api.filterEvents(mockEvents, {
                category: 'Sports',
            });
            expect(result).toHaveLength(0);
        });

        it('should be case sensitive for category', () => {
            const result = api.filterEvents(mockEvents, {
                category: 'politics',
            });
            expect(result).toHaveLength(0);
        });
    });

    describe('tags filtering', () => {
        it('should filter by single tag', () => {
            const result = api.filterEvents(mockEvents, {
                tags: ['Fed'],
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('4');
        });

        it('should filter by multiple tags (OR logic)', () => {
            const result = api.filterEvents(mockEvents, {
                tags: ['Election', 'Bitcoin'],
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('3');
        });

        it('should be case insensitive', () => {
            const result = api.filterEvents(mockEvents, {
                tags: ['bitcoin'],
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('3');
        });

        it('should match any of provided tags', () => {
            const result = api.filterEvents(mockEvents, {
                tags: ['Trump', 'Interest Rates'],
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('2');
            expect(result.map(e => e.id)).toContain('4');
        });
    });

    describe('marketCount filtering', () => {
        it('should filter by minimum market count', () => {
            const result = api.filterEvents(mockEvents, {
                marketCount: { min: 4 },
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });

        it('should filter by maximum market count', () => {
            const result = api.filterEvents(mockEvents, {
                marketCount: { max: 2 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('3');
            expect(result.map(e => e.id)).toContain('4');
        });

        it('should filter by market count range', () => {
            const result = api.filterEvents(mockEvents, {
                marketCount: { min: 2, max: 4 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('3');
        });

        it('should handle exact market count', () => {
            const result = api.filterEvents(mockEvents, {
                marketCount: { min: 1, max: 1 },
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('4');
        });
    });

    describe('totalVolume filtering', () => {
        it('should filter by minimum total volume', () => {
            const result = api.filterEvents(mockEvents, {
                totalVolume: { min: 100000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('3');
        });

        it('should filter by maximum total volume', () => {
            const result = api.filterEvents(mockEvents, {
                totalVolume: { max: 80000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('2');
            expect(result.map(e => e.id)).toContain('4');
        });

        it('should filter by total volume range', () => {
            const result = api.filterEvents(mockEvents, {
                totalVolume: { min: 60000, max: 110000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('2');
        });

        it('should calculate total volume correctly', () => {
            // Event 1: 50000 + 40000 + 10000 = 100000
            const result = api.filterEvents(mockEvents, {
                totalVolume: { min: 100000, max: 100000 },
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('1');
        });
    });

    describe('combined filters', () => {
        it('should combine text and category filters', () => {
            const result = api.filterEvents(mockEvents, {
                text: 'Trump',
                category: 'Politics',
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });

        it('should combine category and marketCount filters', () => {
            const result = api.filterEvents(mockEvents, {
                category: 'Politics',
                marketCount: { min: 3 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('2');
        });

        it('should combine multiple filters (complex query)', () => {
            const result = api.filterEvents(mockEvents, {
                text: 'Trump',
                searchIn: ['title', 'tags'],
                category: 'Politics',
                marketCount: { min: 4 },
                totalVolume: { min: 70000 },
            });
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });

        it('should combine tags and volume filters', () => {
            const result = api.filterEvents(mockEvents, {
                tags: ['Election', 'Bitcoin'],
                totalVolume: { min: 100000 },
            });
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('3');
        });
    });

    describe('predicate function', () => {
        it('should filter using custom predicate', () => {
            const result = api.filterEvents(mockEvents, e => e.markets.length > 3);
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('2');
        });

        it('should filter by complex custom logic', () => {
            const result = api.filterEvents(
                mockEvents,
                e =>
                    e.category === 'Politics' &&
                    e.markets.reduce((sum, m) => sum + m.volume24h, 0) > 70000
            );
            expect(result).toHaveLength(2);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('2');
        });

        it('should handle nested market filtering', () => {
            const result = api.filterEvents(mockEvents, e =>
                e.markets.some(m => m.volume24h > 70000)
            );
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('3');
        });

        it('should filter by event metadata', () => {
            const result = api.filterEvents(
                mockEvents,
                e => e.slug.includes('2024') || e.slug.includes('trump')
            );
            expect(result).toHaveLength(3);
            expect(result.map(e => e.id)).toContain('1');
            expect(result.map(e => e.id)).toContain('2');
            expect(result.map(e => e.id)).toContain('3');
        });
    });

    describe('edge cases', () => {
        it('should return all events with empty criteria object', () => {
            const result = api.filterEvents(mockEvents, {});
            expect(result).toHaveLength(4);
        });

        it('should handle empty events array', () => {
            const result = api.filterEvents([], 'Trump');
            expect(result).toHaveLength(0);
        });

        it('should handle events without optional fields', () => {
            const sparseEvent: UnifiedEvent = {
                id: '5',
                title: 'Sparse Event',
                description: 'Has minimal fields',
                slug: 'sparse-event',
                url: 'https://example.com/5',
                markets: [],
            };

            const result = api.filterEvents([sparseEvent], {
                category: 'Politics',
            });
            expect(result).toHaveLength(0);
        });

        it('should handle events with no markets', () => {
            const noMarketsEvent: UnifiedEvent = {
                id: '6',
                title: 'Empty Event',
                description: 'No markets',
                slug: 'empty-event',
                url: 'https://example.com/6',
                category: 'Politics',
                tags: ['Test'],
                markets: [],
            };

            const result = api.filterEvents([noMarketsEvent], {
                marketCount: { min: 1 },
            });
            expect(result).toHaveLength(0);
        });

        it('should calculate zero total volume for events with no markets', () => {
            const noMarketsEvent: UnifiedEvent = {
                id: '7',
                title: 'Zero Volume Event',
                description: 'No markets',
                slug: 'zero-volume',
                url: 'https://example.com/7',
                category: 'Politics',
                markets: [],
            };

            const result = api.filterEvents([noMarketsEvent], {
                totalVolume: { max: 1000 },
            });
            expect(result).toHaveLength(1);
        });
    });
});
