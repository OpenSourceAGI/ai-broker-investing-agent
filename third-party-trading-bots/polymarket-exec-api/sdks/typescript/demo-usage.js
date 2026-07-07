/**
 * Simple demo showing MarketList.match() usage without needing a running server
 */

const { MarketList } = require('./dist/index.js');

// Create sample markets
const sampleMarkets = [
    {
        marketId: '0x123',
        title: 'Oscars 2026: Best Picture Winner - Dune Part Two',
        description: 'Will Dune Part Two win Best Picture?',
        category: 'Entertainment',
        outcomes: [
            { label: 'Yes', price: 0.45 },
            { label: 'No', price: 0.55 }
        ],
        volume24h: 50000,
        liquidity: 25000,
        url: 'https://example.com/market/1',
        tags: ['oscars', 'movies', '2026']
    },
    {
        marketId: '0x456',
        title: 'Oscars 2026: Best Picture Winner - One Battle',
        description: 'Will One Battle win Best Picture?',
        category: 'Entertainment',
        outcomes: [
            { label: 'Yes', price: 0.22 },
            { label: 'No', price: 0.78 }
        ],
        volume24h: 30000,
        liquidity: 15000,
        url: 'https://example.com/market/2',
        tags: ['oscars', 'movies', '2026']
    },
    {
        marketId: '0x789',
        title: 'Oscars 2026: Best Picture Winner - Conclave',
        description: 'Will Conclave win Best Picture?',
        category: 'Entertainment',
        outcomes: [
            { label: 'Yes', price: 0.33 },
            { label: 'No', price: 0.67 }
        ],
        volume24h: 40000,
        liquidity: 20000,
        url: 'https://example.com/market/3',
        tags: ['oscars', 'movies', '2026']
    }
];

// Create a MarketList (simulating event.markets)
const oscarsMarkets = new MarketList(...sampleMarkets);

console.log('=== MarketList.match() Demo ===\n');

console.log('Sample markets:');
oscarsMarkets.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.title}`);
});

console.log('\n--- Test 1: Find "One Battle" ---');
try {
    const match = oscarsMarkets.match('One Battle');
    console.log(`✓ Success: Found "${match.title}"`);
    console.log(`  Market ID: ${match.marketId}`);
    console.log(`  Volume: $${match.volume24h}`);
} catch (e) {
    console.log(`✗ Failed: ${e.message}`);
}

console.log('\n--- Test 2: Case-insensitive search "one battle" ---');
try {
    const match = oscarsMarkets.match('one battle');
    console.log(`✓ Success: Found "${match.title}"`);
} catch (e) {
    console.log(`✗ Failed: ${e.message}`);
}

console.log('\n--- Test 3: Search for partial match "Conclave" ---');
try {
    const match = oscarsMarkets.match('Conclave');
    console.log(`✓ Success: Found "${match.title}"`);
} catch (e) {
    console.log(`✗ Failed: ${e.message}`);
}

console.log('\n--- Test 4: Ambiguous search "Best" (multiple matches) ---');
try {
    const match = oscarsMarkets.match('Best');
    console.log(`✓ Unexpected success: ${match.title}`);
} catch (e) {
    console.log(`✓ Expected error: ${e.message}`);
}

console.log('\n--- Test 5: No match "Nonexistent" ---');
try {
    const match = oscarsMarkets.match('Nonexistent');
    console.log(`✓ Unexpected success: ${match.title}`);
} catch (e) {
    console.log(`✓ Expected error: ${e.message}`);
}

console.log('\n--- Test 6: Search in description field ---');
try {
    const match = oscarsMarkets.match('Will Dune', ['description']);
    console.log(`✓ Success: Found "${match.title}"`);
} catch (e) {
    console.log(`✗ Failed: ${e.message}`);
}

console.log('\n--- Test 7: Array compatibility (indexing) ---');
console.log(`oscarsMarkets[0].title: "${oscarsMarkets[0].title}"`);
console.log(`oscarsMarkets.length: ${oscarsMarkets.length}`);

console.log('\n--- Test 8: Array compatibility (map) ---');
const titles = oscarsMarkets.map(m => m.title);
console.log('Using .map():');
titles.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));

console.log('\n--- Test 9: Array compatibility (filter) ---');
const filtered = oscarsMarkets.filter(m => m.volume24h > 35000);
console.log(`Markets with volume > $35k: ${filtered.length}`);
filtered.forEach(m => console.log(`  - ${m.title}: $${m.volume24h}`));

console.log('\n=== All tests completed ===\n');
