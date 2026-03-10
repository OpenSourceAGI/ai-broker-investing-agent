import { MarketList, UnifiedMarket, MarketOutcome } from '../index';

function makeOutcome(overrides: Partial<MarketOutcome> = {}): MarketOutcome {
    return {
        outcomeId: 'out-1',
        label: 'Yes',
        price: 0.5,
        ...overrides,
    };
}

function makeMarket(overrides: Partial<UnifiedMarket> = {}): UnifiedMarket {
    return {
        marketId: 'mkt-1',
        title: 'Will it rain tomorrow?',
        outcomes: [makeOutcome()],
        volume24h: 1000,
        liquidity: 500,
        url: 'https://example.com/market/1',
        ...overrides,
    };
}

describe('MarketList', () => {
    describe('extends Array', () => {
        it('supports indexing', () => {
            const list = new MarketList();
            const m = makeMarket();
            list.push(m);
            expect(list[0]).toBe(m);
        });

        it('supports length', () => {
            const list = new MarketList();
            expect(list.length).toBe(0);
            list.push(makeMarket());
            expect(list.length).toBe(1);
        });

        it('supports iteration', () => {
            const list = new MarketList();
            list.push(makeMarket({ marketId: 'a' }));
            list.push(makeMarket({ marketId: 'b' }));
            const ids = [];
            for (const m of list) {
                ids.push(m.marketId);
            }
            expect(ids).toEqual(['a', 'b']);
        });

        it('supports map/filter/etc', () => {
            const list = new MarketList();
            list.push(makeMarket({ title: 'Alpha' }));
            list.push(makeMarket({ title: 'Beta' }));
            const titles = list.map(m => m.title);
            expect(titles).toEqual(['Alpha', 'Beta']);
        });
    });

    describe('match()', () => {
        let list: MarketList;

        beforeEach(() => {
            list = new MarketList();
            list.push(
                makeMarket({ marketId: '1', title: 'Will Kevin Warsh be Fed Chair?' }),
                makeMarket({ marketId: '2', title: 'Will Jerome Powell resign?' }),
                makeMarket({ marketId: '3', title: 'Fed interest rate above 5%?' }),
            );
        });

        it('returns a single match by title substring', () => {
            const result = list.match('Kevin Warsh');
            expect(result.marketId).toBe('1');
        });

        it('is case-insensitive', () => {
            const result = list.match('kevin warsh');
            expect(result.marketId).toBe('1');
        });

        it('throws on no matches', () => {
            expect(() => list.match('nonexistent')).toThrow("No markets matching 'nonexistent'");
        });

        it('throws on multiple matches', () => {
            expect(() => list.match('Fed')).toThrow(/Multiple markets matching 'Fed'/);
        });

        it('includes titles in multi-match error', () => {
            try {
                list.match('Fed');
                fail('Expected error');
            } catch (e: any) {
                expect(e.message).toContain('Will Kevin Warsh be Fed Chair?');
                expect(e.message).toContain('Fed interest rate above 5%?');
            }
        });

        it('searches description when specified', () => {
            list = new MarketList();
            list.push(
                makeMarket({ marketId: '1', title: 'Market A', description: 'About crypto trading' }),
                makeMarket({ marketId: '2', title: 'Market B', description: 'About elections' }),
            );
            const result = list.match('crypto', ['description']);
            expect(result.marketId).toBe('1');
        });

        it('searches category when specified', () => {
            list = new MarketList();
            list.push(
                makeMarket({ marketId: '1', title: 'Market A', category: 'politics' }),
                makeMarket({ marketId: '2', title: 'Market B', category: 'sports' }),
            );
            const result = list.match('sports', ['category']);
            expect(result.marketId).toBe('2');
        });

        it('searches tags when specified', () => {
            list = new MarketList();
            list.push(
                makeMarket({ marketId: '1', title: 'Market A', tags: ['crypto', 'defi'] }),
                makeMarket({ marketId: '2', title: 'Market B', tags: ['election', 'us'] }),
            );
            const result = list.match('defi', ['tags']);
            expect(result.marketId).toBe('1');
        });

        it('searches outcomes when specified', () => {
            list = new MarketList();
            list.push(
                makeMarket({
                    marketId: '1',
                    title: 'Election',
                    outcomes: [
                        makeOutcome({ label: 'Trump' }),
                        makeOutcome({ label: 'Biden' }),
                    ],
                }),
                makeMarket({
                    marketId: '2',
                    title: 'Fed Chair',
                    outcomes: [
                        makeOutcome({ label: 'Warsh' }),
                        makeOutcome({ label: 'Powell' }),
                    ],
                }),
            );
            const result = list.match('Trump', ['outcomes']);
            expect(result.marketId).toBe('1');
        });

        it('searches multiple fields', () => {
            list = new MarketList();
            list.push(
                makeMarket({ marketId: '1', title: 'Market A', description: 'hidden gem' }),
                makeMarket({ marketId: '2', title: 'hidden Market B' }),
            );
            // Both match when searching title + description
            expect(() => list.match('hidden', ['title', 'description'])).toThrow(/Multiple/);
            // Only one matches in description alone
            const result = list.match('gem', ['description']);
            expect(result.marketId).toBe('1');
        });

        it('defaults to title-only search', () => {
            list = new MarketList();
            list.push(
                makeMarket({ marketId: '1', title: 'Unique Title', description: 'shared keyword' }),
                makeMarket({ marketId: '2', title: 'Another Title', description: 'shared keyword' }),
            );
            // "shared keyword" is in descriptions but not titles
            expect(() => list.match('shared keyword')).toThrow(/No markets matching/);
            // Title search works
            const result = list.match('Unique');
            expect(result.marketId).toBe('1');
        });
    });
});
