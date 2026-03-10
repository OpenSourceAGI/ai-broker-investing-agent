import pmxt from '../../../src';

async function run() {
    const client = new pmxt.Limitless();

    const marketAddress = '0xE082AF5a25f5D3904fae514CD03dC99F9Ff39fBc';

    console.log('Subscribing to AMM price updates...\n');

    await client.watchPrices(marketAddress, (data) => {
        console.log(`[Price Update] Market: ${data.marketAddress}`);
        console.log(`  Prices: ${JSON.stringify(data.updatedPrices)}`);
        console.log(`  Block: ${data.blockNumber}`);
    });

    // Keep running until interrupted
    await new Promise(() => {});
}

process.on('SIGINT', () => process.exit(0));
run().catch(console.error);
