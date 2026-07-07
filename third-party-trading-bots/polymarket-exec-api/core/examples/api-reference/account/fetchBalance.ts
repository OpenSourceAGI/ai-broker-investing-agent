import { config } from 'dotenv'; config({ path: '../../../.env' });
import pmxt from '../../../src';

const main = async () => {
    const client = new pmxt.Probable({
        privateKey: process.env.PROBABLE_PRIVATE_KEY,
        apiKey: process.env.PROBABLE_API_KEY,
        apiSecret: process.env.PROBABLE_API_SECRET,
        passphrase: process.env.PROBABLE_PASSPHRASE
    });

    const balances = await client.fetchBalance();

    for (const b of balances) {
        console.log(`${b.currency}: total=${b.total} available=${b.available} locked=${b.locked}`);
    }
};

main();
