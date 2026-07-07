import 'dotenv/config';
import { config } from 'dotenv'; config({ path: '../../.env' });
import pmxt from '../../src/index';

(async () => {
    const client = new pmxt.Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
    const orders = await client.fetchOpenOrders();
    console.log(orders);
})();
