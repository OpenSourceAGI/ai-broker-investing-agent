import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    // Find a market and get the outcome ID
    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    const market = markets[0];
    const outcomeId = market.yes!.outcomeId;

    console.log(`OHLCV for: ${market.title} (Yes)`);

    const candles = await api.fetchOHLCV(outcomeId, {
        resolution: '1h',
        limit: 5
    });

    for (const c of candles) {
        console.log(`  ${new Date(c.timestamp).toISOString()} O:${c.open} H:${c.high} L:${c.low} C:${c.close} V:${c.volume}`);
    }
};

main();
