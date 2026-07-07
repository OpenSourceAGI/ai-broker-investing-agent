import { config } from 'dotenv';
import path from 'path';
// Load .env from the root directory
config({ path: path.resolve(__dirname, '../../../.env') });

import pmxt from '../../src/index';

/**
 * Example demonstrating Limitless WebSocket functionality.
 * This example shows:
 * 1. Real-time orderbook updates (CLOB markets)
 * 2. Real-time AMM price updates
 * 3. User position updates (requires API key)
 * 4. User transaction updates (requires API key)
 */

async function demonstrateWebSockets() {
    console.log('=== Limitless WebSocket Demo ===\n');

    // Initialize Limitless client with API key (optional for public subscriptions)
    const client = new pmxt.Limitless({
        apiKey: process.env.LIMITLESS_API_KEY,
        privateKey: process.env.LIMITLESS_PRIVATE_KEY,
    });

    // Example market slug for CLOB orderbook
    const marketSlug = 'largest-company-end-of-2025-1746118069282';

    // Example market address for AMM prices
    const marketAddress = '0xE082AF5a25f5D3904fae514CD03dC99F9Ff39fBc';

    try {
        // 1. Subscribe to CLOB orderbook updates (no auth required)
        console.log('1. Subscribing to CLOB orderbook updates...');
        await client.watchOrderBook(marketSlug, (orderbook) => {
            console.log('\n[Orderbook Update]');
            console.log(`  Market: ${marketSlug}`);
            console.log(`  Best Bid: ${orderbook.bids[0]?.[0] || 'N/A'}`);
            console.log(`  Best Ask: ${orderbook.asks[0]?.[0] || 'N/A'}`);
            console.log(`  Timestamp: ${new Date(orderbook.timestamp).toISOString()}`);
        });
        console.log('Subscribed to orderbook updates\n');

        // 2. Subscribe to AMM price updates (no auth required)
        console.log('2. Subscribing to AMM price updates...');
        await client.watchPrices(marketAddress, (data) => {
            console.log('\n[AMM Price Update]');
            console.log(`  Market: ${data.marketAddress}`);
            console.log(`  Prices: ${JSON.stringify(data.updatedPrices)}`);
            console.log(`  Block: ${data.blockNumber}`);
        });
        console.log('Subscribed to AMM price updates\n');

        // 3. Subscribe to user positions (requires API key)
        if (process.env.LIMITLESS_API_KEY) {
            console.log('3. Subscribing to user position updates...');
            await client.watchUserPositions((data) => {
                console.log('\n[Position Update]');
                console.log(`  Positions: ${JSON.stringify(data, null, 2)}`);
            });
            console.log('Subscribed to user position updates\n');

            // 4. Subscribe to user transactions (requires API key)
            console.log('4. Subscribing to user transaction updates...');
            await client.watchUserTransactions((data) => {
                console.log('\n[Transaction Update]');
                console.log(`  Transaction: ${JSON.stringify(data, null, 2)}`);
            });
            console.log('Subscribed to user transaction updates\n');
        } else {
            console.log('  Skipping authenticated subscriptions (LIMITLESS_API_KEY not set)\n');
        }

        console.log('🎧 Listening for updates... (Press Ctrl+C to exit)\n');

        // Keep the process running to receive updates
        await new Promise(() => {
            // This will run indefinitely until the user stops it
        });
    } catch (error: any) {
        console.error('Error:', error.message);

        if (error.message.includes('API key')) {
            console.log('\nNote: User position and transaction updates require an API key.');
            console.log('Generate one at: https://limitless.exchange (Profile → API keys)');
        }
    } finally {
        // Clean up
        await client.close();
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    process.exit(0);
});

demonstrateWebSockets().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
