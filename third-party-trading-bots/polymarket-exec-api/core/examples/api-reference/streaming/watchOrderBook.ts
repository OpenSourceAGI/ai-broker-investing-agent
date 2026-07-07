import pmxt from '../../../src';

// NOTE: This example does not work with tsx due to @prob/clob SDK compatibility issues.
// Use the .mjs version with native Node.js instead: node examples/api-reference/streaming/watchOrderBook.mjs
// See README.md in this directory for more information.


async function run() {
    const api = new pmxt.Probable();

    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    const market = markets[0];
    const outcomeId = market.yes!.outcomeId;

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
    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await api.close();
    }
}

run().catch(console.error);
