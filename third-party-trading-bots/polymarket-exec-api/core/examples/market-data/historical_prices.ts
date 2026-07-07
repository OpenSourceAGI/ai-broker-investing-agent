import pmxt from '../../src';

const main = async () => {
    const api = new pmxt.Polymarket();
    const markets = await api.fetchMarkets({ slug: 'who-will-trump-nominate-as-fed-chair' });
    const warsh = markets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');

    const history = await api.fetchOHLCV(warsh!.outcomes[0].metadata.clobTokenId, {
        resolution: '1h',
        limit: 5
    });

    console.log(history);
};

main();
