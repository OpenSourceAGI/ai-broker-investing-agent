import * as dotenv from 'dotenv';
import * as path from 'path';
import { PolymarketExchange } from '../src/exchanges/polymarket';

// Load .env from repo root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const NO_TOKEN_ID = '43946269812975261940442841140057396362355013850035195910637438338242851933505';
const MARKET_ID = '0x4b78de44ea49d0eb8d5fee85352294b6f679a47c56944c6ad5c945e9a2ba7211';

async function main() {
    if (!process.env.POLYMARKET_PRIVATE_KEY) {
        console.error('Missing POLYMARKET_PRIVATE_KEY in .env');
        process.exit(1);
    }

    const exchange = new PolymarketExchange({
        credentials: {
            privateKey: process.env.POLYMARKET_PRIVATE_KEY!,
            funderAddress: process.env.POLYMARKET_PROXY_ADDRESS,
            signatureType: 'gnosisSafe',
        },
    });

    console.log('Placing market order...');

    const start = performance.now();

    const order = await exchange.createOrder({
        marketId: MARKET_ID,
        outcomeId: NO_TOKEN_ID,
        side: 'buy',
        type: 'market',
        amount: 2,
    });

    const end = performance.now();

    console.log(`Order ID: ${order.id}`);
    console.log(`Completed in: ${(end - start).toFixed(2)}ms`);
}

main().catch((err) => {
    console.error('Error placing order:', err.message);
    process.exit(1);
});
