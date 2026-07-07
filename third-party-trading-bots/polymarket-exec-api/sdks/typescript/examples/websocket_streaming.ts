/**
 * Example: Streaming real-time order book and trade updates
 * 
 * This demonstrates the CCXT Pro-style WebSocket streaming API.
 * Currently only supported for Polymarket.
 */

import { Polymarket } from '../pmxt/client.js';

async function main() {
    const poly = new Polymarket();

    // Search for a market
    const markets = await poly.fetchMarkets({ query: 'Trump', limit: 1 });

    if (markets.length === 0) {
        console.log('No markets found');
        return;
    }

    const market = markets[0];
    console.log(`\nStreaming data for: ${market.title}`);

    const outcome = market.outcomes[0];
    console.log(`Outcome: ${outcome.label} (ID: ${outcome.outcomeId})\n`);

    // Stream order book updates
    console.log('--- Order Book Stream ---');
    for (let i = 0; i < 5; i++) {
        try {
            const orderBook = await poly.watchOrderBook(outcome.outcomeId);

            const bestBid = orderBook.bids[0];
            const bestAsk = orderBook.asks[0];
            const spread = bestAsk.price - bestBid.price;

            console.log(`[${new Date(orderBook.timestamp).toISOString()}]`);
            console.log(`  Best Bid: ${bestBid.price.toFixed(4)} (${bestBid.size.toFixed(2)})`);
            console.log(`  Best Ask: ${bestAsk.price.toFixed(4)} (${bestAsk.size.toFixed(2)})`);
            console.log(`  Spread: ${spread.toFixed(4)}\n`);
        } catch (error: any) {
            console.error(`Error watching order book: ${error.message}`);
            break;
        }
    }

    // Stream trade updates
    console.log('--- Trade Stream ---');
    for (let i = 0; i < 5; i++) {
        try {
            const trades = await poly.watchTrades(outcome.outcomeId);

            for (const trade of trades) {
                console.log(`[${new Date(trade.timestamp).toISOString()}]`);
                console.log(`  ${trade.side.toUpperCase()}: ${trade.price.toFixed(4)} @ ${trade.amount.toFixed(2)}\n`);
            }
        } catch (error: any) {
            console.error(`Error watching trades: ${error.message}`);
            break;
        }
    }

    console.log('Stream complete!');
}

main().catch(console.error);
