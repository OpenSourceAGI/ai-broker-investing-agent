import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    // Search by query string
    const markets = await api.fetchMarkets({ query: 'Bitcoin' });
    console.log(`Found ${markets.length} markets`);

    for (const market of markets.slice(0, 3)) {
        console.log(`  ${market.title} (${market.outcomes.length} outcomes)`);
    }

    // Search by slug
    const specific = await api.fetchMarkets({ slug: 'opinion-fdv-above-one-day-after-launch?market=584' });
    console.log('\nBy slug:', specific.length, 'result(s)');
};

main();
