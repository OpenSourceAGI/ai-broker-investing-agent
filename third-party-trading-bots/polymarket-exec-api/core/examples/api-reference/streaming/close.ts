import pmxt from '../../../src';





async function run() {
    const api = new pmxt.Probable();

    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    const outcomeId = markets[0].yes!.outcomeId;

    // Start streaming
    const book = await api.watchOrderBook(outcomeId);
    console.log('Got first update, best bid:', book.bids[0]?.price);

    // Close all websocket connections when done
    await api.close();
    console.log('Connections closed');
}

run().catch(console.error);
