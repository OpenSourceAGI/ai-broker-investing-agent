// This example requires building the project first: npm run build
// Then run: cd core && node examples/api-reference/streaming/watchOrderBook-dist.mjs

import pmxt from '../../../dist/index.js';

async function run() {
    const api = new pmxt.Probable();

    const markets = await api.fetchMarkets({ query: 'Satoshi' });
    const market = markets[0];
    const outcomeId = market.yes.outcomeId;

    console.log(`Streaming order book for: ${market.title}\n`);

    let updates = 0;
    try {
        while (updates < 3) {
            const book = await api.watchOrderBook(outcomeId);

            if (book.bids[0] && book.asks[0]) {
                const spread = book.asks[0].price - book.bids[0].price;
                console.log(`Update ${++updates}: Bid: ${book.bids[0].price} | Ask: ${book.asks[0].price} | Spread: ${spread.toFixed(3)}`);
            }
        }
        console.log('\n✅ Successfully received 3 order book updates!');
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await api.close();
        console.log('WebSocket closed.');
    }
}

run().catch(console.error);
