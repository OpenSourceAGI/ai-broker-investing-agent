import pmxt, { getExecutionPriceDetailed } from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    const market = markets[0];
    const outcomeId = market.outcomes[0].outcomeId;

    const book = await api.fetchOrderBook(outcomeId);

    const result = getExecutionPriceDetailed(book, 'buy', 500);

    console.log(`VWAP: $${result.price.toFixed(4)}`);
    console.log(`Filled: ${result.filledAmount} / 500`);
    console.log(`Fully filled: ${result.fullyFilled}`);
};

main();
