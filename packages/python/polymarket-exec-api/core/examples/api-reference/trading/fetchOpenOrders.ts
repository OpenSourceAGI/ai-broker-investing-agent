import { config } from 'dotenv'; config({ path: '../../../.env' });
import pmxt from '../../../src';

const main = async () => {
    const client = new pmxt.Probable({
        privateKey: process.env.PROBABLE_PRIVATE_KEY,
        apiKey: process.env.PROBABLE_API_KEY,
        apiSecret: process.env.PROBABLE_API_SECRET,
        passphrase: process.env.PROBABLE_PASSPHRASE
    });

    const orders = await client.fetchOpenOrders();

    console.log(`Open orders: ${orders.length}`);
    for (const order of orders) {
        console.log(`  ${order.id}: ${order.side} ${order.amount} @ ${order.price} (${order.status})`);
    }
};

main();
