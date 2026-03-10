import 'dotenv/config';
import { config } from 'dotenv'; config({ path: '../../.env' });
import pmxt from '../../src/index';

(async () => {
    const client = new pmxt.Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
    const order = await client.createOrder({
        marketId: '663583',
        outcomeId: '10991849228756847439673778874175365458450913336396982752046655649803657501964',
        side: 'buy',
        type: 'limit',
        amount: 10,
        price: 0.10
    });
    console.log(order);
})();
