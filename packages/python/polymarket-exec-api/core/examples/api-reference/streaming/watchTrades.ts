import pmxt from '../../../src';

async function run() {
    const api = new pmxt.Probable();

    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    const market = markets[0];
    const outcomeId = market.outcomes[0].outcomeId;

    console.log(`Streaming trades for: ${market.title}\n`);

    try {
        while (true) {
            const trades = await api.watchTrades(outcomeId);
            for (const t of trades) {
                console.log(`${t.side} ${t.amount} @ ${t.price} (${new Date(t.timestamp).toLocaleTimeString()})`);
            }
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await api.close();
    }
}

run().catch(console.error);
