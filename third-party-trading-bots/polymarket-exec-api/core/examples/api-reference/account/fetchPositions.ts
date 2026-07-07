import { config } from 'dotenv'; config({ path: '../../../.env' });
import pmxt from '../../../src';

const main = async () => {
    const client = new pmxt.Probable({
        privateKey: process.env.PROBABLE_PRIVATE_KEY,
        apiKey: process.env.PROBABLE_API_KEY,
        apiSecret: process.env.PROBABLE_API_SECRET,
        passphrase: process.env.PROBABLE_PASSPHRASE
    });

    const positions = await client.fetchPositions();

    console.log(`Positions: ${positions.length}`);
    for (const pos of positions) {
        console.log(`  ${pos.outcomeLabel}: size=${pos.size} entry=${pos.entryPrice} current=${pos.currentPrice} pnl=${pos.unrealizedPnL}`);
    }
};

main();
