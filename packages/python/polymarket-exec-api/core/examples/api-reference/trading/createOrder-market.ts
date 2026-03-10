import { config } from 'dotenv'; config({ path: '../../../.env' });
import pmxt from '../../../src';

const main = async () => {
    const client = new pmxt.Probable({
        privateKey: process.env.PROBABLE_PRIVATE_KEY,
        apiKey: process.env.PROBABLE_API_KEY,
        apiSecret: process.env.PROBABLE_API_SECRET,
        passphrase: process.env.PROBABLE_PASSPHRASE
    });

    const order = await client.createOrder({
        marketId: '460',
        outcomeId: '91975231932642806219638642413279251988787535529150808087660123550088450013310',
        side: 'buy',
        type: 'market',
        amount: 10
    });

    console.log(order);
};

main();
