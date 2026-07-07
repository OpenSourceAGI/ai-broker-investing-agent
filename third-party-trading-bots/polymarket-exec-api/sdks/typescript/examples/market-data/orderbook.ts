import pmxt from 'pmxtjs';

const main = async () => {
    const api = new pmxt.Kalshi();
    const markets = await api.fetchMarkets({ slug: 'KXFEDCHAIRNOM-29' });
    const warsh = markets.find(m => m.outcomes[0]?.label === 'Kevin Warsh');

    if (warsh) {
        const book = await api.fetchOrderBook(warsh.outcomes[0].outcomeId);
        console.log(book);
    } else {
        console.log('Market not found');
    }
};

main();
