import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    const events = await api.fetchEvents({ query: 'Bitcoin' });

    for (const event of events) {
        console.log(`Event: ${event.title}`);
        console.log(`  Markets: ${event.markets.length}`);
        for (const m of event.markets.slice(0, 3)) {
            console.log(`    - ${m.title}`);
        }
    }
};

main();
