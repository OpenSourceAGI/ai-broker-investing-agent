import { Polymarket, Kalshi, Limitless, Myriad, Probable, Baozi } from '../core/src/index';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const exchanges: any[] = [];

// Initialize exchanges we have keys for (or just public if keys not needed for fetchMarkets)

// 1. Polymarket
exchanges.push(new Polymarket({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY
}));

// 2. Kalshi
exchanges.push(new Kalshi({
    apiKey: process.env.KALSHI_API_KEY,
    privateKey: process.env.KALSHI_PRIVATE_KEY
}));

// 3. Limitless
exchanges.push(new Limitless({
    apiKey: process.env.LIMITLESS_API_KEY,
    privateKey: process.env.LIMITLESS_PRIVATE_KEY
}));

// 4. Myriad
exchanges.push(new Myriad({
    apiKey: process.env.MYRIAD_PROD // Assuming prod key
}));

// 5. Probable
exchanges.push(new Probable());

// 6. Baozi
exchanges.push(new Baozi({
    privateKey: process.env.BAOZI_PRIVATE_KEY
}));


async function testLoadMarkets() {
    console.log('Testing loadMarkets on all exchanges...');

    for (const exchange of exchanges) {
        console.log(`\n---------------------------------------------------------`);
        console.log(`Testing ${exchange.name}...`);

        try {
            console.log(`[${exchange.name}] .loadedMarkets before: ${exchange.loadedMarkets}`);
            const start = Date.now();

            // 1. Load Markets
            const markets = await exchange.loadMarkets();
            const duration = Date.now() - start;

            const count = Object.keys(markets).length;
            const slugCount = Object.keys(exchange.marketsBySlug).length;

            console.log(`[${exchange.name}] Loaded ${count} markets in ${duration}ms`);
            console.log(`[${exchange.name}] .loadedMarkets after: ${exchange.loadedMarkets}`);
            console.log(`[${exchange.name}] Cached by Slug: ${slugCount}`);

            if (count > 0) {
                // Verify structure
                const firstId = Object.keys(markets)[0];
                const firstMarket = markets[firstId];
                console.log(`[${exchange.name}] First Market: ${firstMarket.title} (ID: ${firstMarket.marketId})`);

                // 2. Test Cached fetchMarket (by ID)
                const cachedStart = Date.now();
                const cachedMarket = await exchange.fetchMarket({ marketId: firstId });
                const cachedDuration = Date.now() - cachedStart;

                if (cachedMarket.marketId === firstId && cachedDuration < 10) {
                    console.log(`[${exchange.name}] ✅ Cached fetchMarket(ID) working (${cachedDuration}ms)`);
                } else {
                    console.warn(`[${exchange.name}] ⚠️ Cached fetchMarket(ID) took ${cachedDuration}ms (expected <10ms)`);
                }

                // 3. Test Cached fetchMarket (by Slug) - if supported
                if (firstMarket.slug && slugCount > 0) {
                    // Note: Some exchanges like Polymarket might not populate slugs consistently or use them for lookup
                    // But if it's in the cache, it should work.
                    try {
                        const slugStart = Date.now();
                        const slugMarket = await exchange.fetchMarket({ slug: firstMarket.slug });
                        const slugDuration = Date.now() - slugStart;
                        console.log(`[${exchange.name}] ✅ Cached fetchMarket(Slug) working (${slugDuration}ms)`);
                    } catch (e) {
                        console.warn(`[${exchange.name}] ⚠️ fetchMarket(Slug) failed: ${e.message}`);
                    }
                }
            } else {
                console.warn(`[${exchange.name}] ⚠️ Returns 0 markets. Is the API down or keys invalid?`);
            }

        } catch (error: any) {
            console.error(`[${exchange.name}] ❌ FAILED: ${error.message}`);
        }
    }
}

testLoadMarkets();
