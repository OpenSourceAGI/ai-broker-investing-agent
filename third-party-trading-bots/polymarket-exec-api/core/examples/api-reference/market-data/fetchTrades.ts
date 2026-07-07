import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    const market = markets[0];
    const outcomeId = market.outcomes[0].outcomeId;

    const trades = await api.fetchTrades(outcomeId, { limit: 5 });

    console.log(`Recent trades for: ${market.title}`);
    for (const t of trades) {
        console.log(`  ${t.side} ${t.amount} @ ${t.price} (${new Date(t.timestamp).toISOString()})`);
    }
};

main();
