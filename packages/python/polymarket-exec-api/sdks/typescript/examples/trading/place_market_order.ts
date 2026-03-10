import 'dotenv/config';
import { config } from 'dotenv'; config({ path: '../../.env' });
import pmxt from 'pmxtjs';

(async () => {
    const client = new pmxt.Polymarket({
        privateKey: process.env.POLYMARKET_PRIVATE_KEY,
        proxyAddress: process.env.POLYMARKET_PROXY_ADDRESS,
    });

    // Option 1: Using outcome shorthand (recommended)
    const markets = await client.fetchMarkets({ query: "Trump" });
    const market = markets[0];
    const order = await client.createOrder({
        outcome: market.yes,
        side: 'buy',
        type: 'market',
        amount: 10
    });
    console.log(order);

    // Option 2: Using explicit IDs (still works)
    // const order = await client.createOrder({
    //     marketId: '663583',
    //     outcomeId: '10991849228756847439673778874175365458450913336396982752046655649803657501964',
    //     side: 'buy',
    //     type: 'market',
    //     amount: 10
    // });
})();
