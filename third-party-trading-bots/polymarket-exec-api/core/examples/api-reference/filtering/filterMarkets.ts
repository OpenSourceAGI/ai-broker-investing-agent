import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();
    const markets = await api.fetchMarkets({ query: 'Bitcoin' });

    // Simple text search
    const textMatch = api.filterMarkets(markets, 'election');
    console.log(`Text match: ${textMatch.length} markets`);

    // Criteria-based filtering
    const highVolume = api.filterMarkets(markets, {
        volume24h: { min: 10000 },
        price: { outcome: 'yes', max: 0.5 }
    });
    console.log(`High volume, cheap Yes: ${highVolume.length} markets`);

    // Custom predicate
    const volatile = api.filterMarkets(markets, market =>
        market.outcomes.some(o => Math.abs(o.priceChange24h || 0) > 0.05)
    );
    console.log(`Volatile (>5% move): ${volatile.length} markets`);
};

main();
