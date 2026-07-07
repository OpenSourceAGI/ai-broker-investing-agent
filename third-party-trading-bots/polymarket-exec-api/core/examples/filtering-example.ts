/**
 * Advanced Filtering Examples for pmxt
 *
 * This file demonstrates the powerful filtering capabilities
 * available for markets and events.
 */

import pmxt from '../src';

const api = new pmxt.Polymarket();

async function main() {
    console.log('=== pmxt Advanced Filtering Examples ===\n');

    // ----------------------------------------------------------------------------
    // Example 1: Simple text search
    // ----------------------------------------------------------------------------
    console.log('Example 1: Simple text search');
    const allMarkets = await api.fetchMarkets({ query: 'Trump' });
    const filtered1 = api.filterMarkets(allMarkets, 'Fed Chair');
    console.log(`Found ${filtered1.length} markets matching "Fed Chair"\n`);

    // ----------------------------------------------------------------------------
    // Example 2: Multi-field text search
    // ----------------------------------------------------------------------------
    console.log('Example 2: Multi-field text search');
    const events = await api.fetchEvents({ query: 'Election' });
    const filtered2 = api.filterMarkets(events[0]?.markets || [], {
        text: 'Trump',
        searchIn: ['title', 'description', 'tags']
    });
    console.log(`Found ${filtered2.length} markets with "Trump" in title/description/tags\n`);

    // ----------------------------------------------------------------------------
    // Example 3: Volume and liquidity filtering
    // ----------------------------------------------------------------------------
    console.log('Example 3: High-volume, liquid markets');
    const filtered3 = api.filterMarkets(allMarkets, {
        volume24h: { min: 10000 },
        liquidity: { min: 5000 }
    });
    console.log(`Found ${filtered3.length} high-volume markets\n`);

    // ----------------------------------------------------------------------------
    // Example 4: Date range filtering
    // ----------------------------------------------------------------------------
    console.log('Example 4: Markets resolving soon');
    const filtered4 = api.filterMarkets(allMarkets, {
        resolutionDate: {
            after: new Date(),
            before: new Date('2025-12-31')
        }
    });
    console.log(`Found ${filtered4.length} markets resolving in 2025\n`);

    // ----------------------------------------------------------------------------
    // Example 5: Price-based filtering
    // ----------------------------------------------------------------------------
    console.log('Example 5: Undervalued "Yes" outcomes');
    const filtered5 = api.filterMarkets(allMarkets, {
        price: {
            outcome: 'yes',
            max: 0.4 // Less than 40%
        }
    });
    console.log(`Found ${filtered5.length} markets with cheap Yes outcomes\n`);

    // ----------------------------------------------------------------------------
    // Example 6: Complex combination
    // ----------------------------------------------------------------------------
    console.log('Example 6: Complex filtering');
    const filtered6 = api.filterMarkets(allMarkets, {
        text: 'Trump',
        searchIn: ['title', 'tags'],
        category: 'Politics',
        volume24h: { min: 50000 },
        liquidity: { min: 10000 },
        resolutionDate: {
            after: new Date(),
            before: new Date('2026-01-01')
        },
        price: {
            outcome: 'yes',
            min: 0.3,
            max: 0.7
        }
    });
    console.log(`Found ${filtered6.length} high-volume political markets with mid-range Yes prices\n`);

    // ----------------------------------------------------------------------------
    // Example 7: Custom predicate function
    // ----------------------------------------------------------------------------
    console.log('Example 7: Custom predicate (volatile outcomes)');
    const filtered7 = api.filterMarkets(allMarkets, market =>
        market.outcomes.some(o =>
            o.price > 0.6 && (o.priceChange24h || 0) < -0.1
        )
    );
    console.log(`Found ${filtered7.length} markets with outcomes that dropped 10%+ today\n`);

    // ----------------------------------------------------------------------------
    // Example 8: Category and tag filtering
    // ----------------------------------------------------------------------------
    console.log('Example 8: Category and tag filtering');
    const filtered8 = api.filterMarkets(allMarkets, {
        category: 'Politics',
        tags: ['Election', '2024', 'Presidential']
    });
    console.log(`Found ${filtered8.length} political markets with election tags\n`);

    // ----------------------------------------------------------------------------
    // Example 9: Event filtering
    // ----------------------------------------------------------------------------
    console.log('Example 9: Event filtering');
    const allEvents = await api.fetchEvents({ query: '2024' });
    const filtered9 = api.filterEvents(allEvents, {
        text: 'Trump',
        category: 'Politics',
        marketCount: { min: 5 },
        totalVolume: { min: 100000 }
    });
    console.log(`Found ${filtered9.length} high-volume political events about Trump\n`);

    // ----------------------------------------------------------------------------
    // Example 10: Combining global search with filtering
    // ----------------------------------------------------------------------------
    console.log('Example 10: Global search + filtering');
    const markets = await api.fetchMarkets({ query: 'Election' });
    const undervalued = api.filterMarkets(markets, {
        price: { outcome: 'yes', max: 0.3 },
        volume24h: { min: 5000 },
        liquidity: { min: 2000 }
    });
    console.log(`Found ${undervalued.length} undervalued election markets with good liquidity\n`);

    // ----------------------------------------------------------------------------
    // Example 11: Price change filtering (movers)
    // ----------------------------------------------------------------------------
    console.log('Example 11: Biggest movers (price change)');
    const movers = api.filterMarkets(allMarkets, {
        priceChange24h: {
            outcome: 'yes',
            max: -0.15 // Dropped more than 15%
        },
        volume24h: { min: 10000 } // Only liquid markets
    });
    console.log(`Found ${movers.length} markets with significant price drops\n`);

    console.log('=== Filtering Examples Complete ===');
}

// Run examples
main().catch(console.error);
