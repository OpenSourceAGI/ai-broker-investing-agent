import pmxt from 'pmxtjs';

const main = async () => {
    const api = new pmxt.Polymarket();
    const markets = await api.fetchMarkets({ slug: 'who-will-trump-nominate-as-fed-chair' });
    const warsh = markets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');

    console.log(warsh?.outcomes[0].price);
};

main();