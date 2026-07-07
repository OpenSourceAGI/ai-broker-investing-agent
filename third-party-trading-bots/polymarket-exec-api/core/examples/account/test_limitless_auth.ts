import { config } from 'dotenv';
import path from 'path';
// Load .env from the root directory
config({ path: path.resolve(__dirname, '../../../.env') });

import pmxt from '../../src/index';

async function testLimitless() {
    console.log('--- Initializing Limitless Client ---');

    // API key is now required (can be set in LIMITLESS_API_KEY env var)
    if (!process.env.LIMITLESS_API_KEY) {
        console.warn('Warning: LIMITLESS_API_KEY not found in .env. This is required for authenticated operations.');
        console.log('Get your API key from: https://limitless.exchange (Profile menu → API keys)');
    }

    // Private key is optional but required for trading operations
    if (!process.env.LIMITLESS_PRIVATE_KEY) {
        console.warn('Warning: LIMITLESS_PRIVATE_KEY not found in .env. This is required for trading and balance operations.');
    }

    const client = new pmxt.Limitless({
        apiKey: process.env.LIMITLESS_API_KEY,
        privateKey: process.env.LIMITLESS_PRIVATE_KEY,
    });

    try {
        console.log('\n--- Fetching Active Markets (No auth required) ---');
        const markets = await client.fetchMarkets({ limit: 5 });
        if (markets.length === 0) {
            console.log('No active markets found.');
        } else {
            console.table(
                markets.map((m) => ({
                    id: m.id,
                    title: m.title.substring(0, 50),
                    outcomes: m.outcomes.length,
                    vol: m.volume24h,
                }))
            );
        }

        if (process.env.LIMITLESS_API_KEY && process.env.LIMITLESS_PRIVATE_KEY) {
            console.log('\n--- Fetching Account Balance (Requires auth) ---');
            const balance = await client.fetchBalance();
            console.table(balance);

            console.log('\n--- Fetching Account Positions (Requires auth) ---');
            const positions = await client.fetchPositions();
            if (positions.length === 0) {
                const address = (client as any).ensureAuth().getAddress();
                console.log(`No open positions found for address: ${address}`);
            } else {
                console.table(positions);
            }
        } else {
            console.log('\n--- Skipping authenticated endpoints (API key or private key not provided) ---');
        }
    } catch (error: any) {
        console.error(`\nTest failed: ${error.message}`);
        if (error.message.includes('API key')) {
            console.log('\nMigration Note:');
            console.log('- Limitless now uses API key authentication instead of cookie-based auth');
            console.log('- Generate an API key via the UI: Profile menu → API keys');
            console.log('- Set LIMITLESS_API_KEY=lmts_your_key_here in your .env file');
        }
    }
}

testLimitless();
