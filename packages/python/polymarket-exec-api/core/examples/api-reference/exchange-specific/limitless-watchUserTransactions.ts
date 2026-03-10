import { config } from 'dotenv'; config({ path: '../../../.env' });
import pmxt from '../../../src';

async function run() {
    const client = new pmxt.Limitless({
        apiKey: process.env.LIMITLESS_API_KEY,
        privateKey: process.env.LIMITLESS_PRIVATE_KEY,
    });

    console.log('Subscribing to transaction updates...\n');

    await client.watchUserTransactions((data) => {
        console.log('[Transaction Update]', JSON.stringify(data, null, 2));
    });

    // Keep running until interrupted
    await new Promise(() => {});
}

process.on('SIGINT', () => process.exit(0));
run().catch(console.error);
