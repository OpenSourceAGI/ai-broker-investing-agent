import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();
    const events = await api.fetchEvents({ query: 'Bitcoin' });

    const filtered = api.filterEvents(events, {
        text: 'Satoshi',
        marketCount: { min: 1 },
    });

    console.log(`Filtered events: ${filtered.length}`);
    for (const event of filtered) {
        console.log(`  ${event.title} (${event.markets.length} markets)`);
    }
};

main();
