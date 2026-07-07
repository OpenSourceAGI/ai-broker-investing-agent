import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    const market = markets[0];
    const outcomeId = market.outcomes[0].outcomeId;

    const book = await api.fetchOrderBook(outcomeId);

    console.log(`Order book for: ${market.title}`);
    console.log(`  Best bid: ${book.bids[0]?.price} (${book.bids[0]?.size})`);
    console.log(`  Best ask: ${book.asks[0]?.price} (${book.asks[0]?.size})`);
    console.log(`  Bid levels: ${book.bids.length}, Ask levels: ${book.asks.length}`);
};

main();
