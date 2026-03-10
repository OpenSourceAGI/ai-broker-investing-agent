import { config } from 'dotenv'; config({ path: '../../../.env' });
import pmxt from '../../../src';

const main = async () => {
    const client = new pmxt.Probable({
        privateKey: process.env.PROBABLE_PRIVATE_KEY,
        apiKey: process.env.PROBABLE_API_KEY,
        apiSecret: process.env.PROBABLE_API_SECRET,
        passphrase: process.env.PROBABLE_PASSPHRASE
    });

    const orderId = 'your-order-id:your-token-id';
    const order = await client.fetchOrder(orderId);

    console.log('Order ID:', order.id);
    console.log('Status:', order.status);
    console.log('Side:', order.side);
    console.log('Price:', order.price);
    console.log('Amount:', order.amount);
    console.log('Filled:', order.filled);
};

main();
