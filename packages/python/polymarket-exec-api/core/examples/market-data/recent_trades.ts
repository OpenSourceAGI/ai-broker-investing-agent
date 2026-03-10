import pmxt from '../../src';

const main = async () => {
    // Kalshi
    const kalshi = new pmxt.Kalshi();
    const kMarkets = await kalshi.fetchMarkets({ slug: 'KXFEDCHAIRNOM-29' });
    const kWarsh = kMarkets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');
    const kTrades = await kalshi.fetchTrades(kWarsh!.outcomes[0].outcomeId, { limit: 10 });
    console.log('Kalshi:', kTrades);

    // Polymarket
    const poly = new pmxt.Polymarket();
    const pMarkets = await poly.fetchMarkets({ slug: 'who-will-trump-nominate-as-fed-chair' });
    const pWarsh = pMarkets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');
    const pTrades = await poly.fetchTrades(pWarsh!.outcomes[0].metadata.clobTokenId, { limit: 10 });
    console.log('Polymarket:', pTrades);
};

main();