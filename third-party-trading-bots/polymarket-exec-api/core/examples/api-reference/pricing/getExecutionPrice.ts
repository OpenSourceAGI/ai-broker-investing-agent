import pmxt, { getExecutionPrice } from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    const market = markets[0];
    const outcomeId = market.outcomes[0].outcomeId;

    const book = await api.fetchOrderBook(outcomeId);

    // Get the VWAP for buying 100 contracts
    const price = getExecutionPrice(book, 'buy', 100);

    if (price > 0) {
        console.log(`Execution price for 100 contracts: $${price.toFixed(4)}`);
    } else {
        console.log('Not enough liquidity to fill 100 contracts');
    }
};

main();
