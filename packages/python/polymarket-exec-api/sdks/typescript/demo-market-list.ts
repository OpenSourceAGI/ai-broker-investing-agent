/**
 * Manual demo script to test MarketList.match() functionality.
 *
 * Usage:
 *   npx ts-node demo-market-list.ts
 *
 * This demonstrates:
 * 1. Searching for an event by title
 * 2. Using event.markets.match() to find a specific market
 * 3. Searching with different field options
 */

import { Polymarket } from './index';

async function main() {
    const polymarket = new Polymarket();

    console.log('Fetching markets from Polymarket...\n');
    const markets = await polymarket.fetchMarkets({ limit: 100 });

    console.log(`Fetched ${markets.length} markets`);
    console.log('\n=== Demo 1: Using MarketList directly ===\n');

    // Create a filtered list (simulating an event's market list)
    const oscarsMarkets = markets.filter(m =>
        m.title.toLowerCase().includes('oscars') ||
        m.title.toLowerCase().includes('best picture')
    );

    console.log(`Found ${oscarsMarkets.length} markets related to Oscars/Best Picture`);

    if (oscarsMarkets.length > 0) {
        console.log('Titles:');
        oscarsMarkets.forEach((m, i) => {
            console.log(`  ${i + 1}. ${m.title}`);
        });

        // Convert to MarketList to test match() method
        const { MarketList } = await import('./pmxt/models.js');
        const marketList = new MarketList(...oscarsMarkets);

        console.log('\n=== Demo 2: Using event.markets.match() ===\n');

        // Try to find "One Battle" if it exists
        try {
            const match = marketList.match('One Battle');
            console.log(`✓ Found market: "${match.title}"`);
            console.log(`  Market ID: ${match.marketId}`);
            console.log(`  Volume 24h: $${match.volume24h}`);
        } catch (e: any) {
            console.log(`✗ Match for 'One Battle' failed: ${e.message}`);
        }

        console.log('\n=== Demo 3: Case-insensitive search ===\n');

        try {
            const match = marketList.match('one battle', ['title']);
            console.log(`✓ Found market (case-insensitive): "${match.title}"`);
        } catch (e: any) {
            console.log(`✗ Match failed: ${e.message}`);
        }

        console.log('\n=== Demo 4: Search with multiple fields ===\n');

        try {
            const match = marketList.match('oscars', ['title', 'description', 'category']);
            console.log(`✓ Found market: "${match.title}"`);
        } catch (e: any) {
            console.log(`✗ Match failed: ${e.message}`);
        }

        console.log('\n=== Demo 5: Ambiguous search (should fail) ===\n');

        try {
            const match = marketList.match('Oscar');
            console.log(`✓ Found market: "${match.title}"`);
        } catch (e: any) {
            console.log(`✗ Expected error (multiple matches): ${e.message}\n`);
        }

        console.log('\n=== Demo 6: Array methods still work ===\n');

        console.log(`marketList[0].title: "${marketList[0].title}"`);
        console.log(`marketList.length: ${marketList.length}`);
        console.log(`Using map: ${marketList.map(m => m.title.substring(0, 30)).join(', ')}`);
    } else {
        console.log('\nNo Oscars-related markets found. Searching for other markets...');

        const { MarketList } = await import('./pmxt/models.js');
        const marketList = new MarketList(...markets.slice(0, 10));

        console.log(`\nUsing MarketList.match() on first 10 markets:`);
        console.log('Titles:');
        marketList.forEach((m, i) => {
            console.log(`  ${i + 1}. ${m.title}`);
        });

        try {
            const firstWord = marketList[0].title.split(' ')[0];
            const match = marketList.match(firstWord);
            console.log(`\n✓ Found match for "${firstWord}": "${match.title}"`);
        } catch (e: any) {
            console.log(`\n✗ Match failed: ${e.message}`);
        }
    }

    console.log('\n=== Done ===\n');
}

main().catch(console.error);
