import { config } from 'dotenv'; config({ path: '../../../.env' });
import pmxt from '../../../src';

const main = async () => {
    const client = new pmxt.Polymarket({ privateKey: process.env.POLYMARKET_PRIVATE_KEY });

    // Pre-warm the SDK caches (tick size, fee rate, neg-risk flag)
    // so the first createOrder call is faster
    const outcomeId = '10991849228756847439673778874175365458450913336396982752046655649803657501964';

    console.log('Pre-warming market...');
    await client.preWarmMarket(outcomeId);
    console.log('Market warmed. Subsequent orders will execute faster.');
};

main();
