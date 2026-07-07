import pmxt from 'pmxtjs';

const main = async () => {
    // Kalshi
    const kalshi = new pmxt.Kalshi();
    const kMarkets = await kalshi.fetchMarkets({ query: 'Fed Chair' });
    const kMarket = kalshi.filterMarkets(kMarkets, 'Kevin Warsh')[0];

    const kTrades = await kalshi.fetchTrades(kMarket.yes!.outcomeId, { limit: 10 });
    console.log('Kalshi:', kTrades);

    // Polymarket
    const poly = new pmxt.Polymarket();
    const pMarkets = await poly.fetchMarkets({ query: 'Fed Chair' });
    const pMarket = poly.filterMarkets(pMarkets, 'Kevin Warsh')[0];

    // Use .yes.outcomeId for convenience
    const pTrades = await poly.fetchTrades(pMarket.yes!.outcomeId, { limit: 10 });
    console.log('Polymarket:', pTrades);
};

main();