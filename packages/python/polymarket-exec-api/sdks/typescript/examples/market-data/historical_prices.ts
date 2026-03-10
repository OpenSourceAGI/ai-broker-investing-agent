import pmxt from 'pmxtjs';

const main = async () => {
    const api = new pmxt.Polymarket();
    const events = await api.fetchEvents({ query: 'Who will Trump nominate as Fed Chair?' });
    const event = events[0];

    // 2. Filter for the specific Market within that event
    const market = api.filterMarkets(event.markets, 'Kevin Warsh')[0];

    // Note: Use market.yes.outcomeId for the outcome ID (CLOB Token ID on Poly)
    const history = await api.fetchOHLCV(market.yes!.outcomeId, {
        resolution: '1h',
        limit: 5
    });

    console.log(history);
};

main();
