import { config } from 'dotenv'; config({ path: '../../.env' });
import pmxt from '../../src/index';

(async () => {
    const client = new pmxt.Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });
    console.log(await client.fetchPositions());
})();
