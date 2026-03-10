import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    const event = await api.getEventBySlug('will-satoshi-move-any-bitcoin-in-2026');

    if (event) {
        console.log(`Event: ${event.title}`);
        console.log(`Markets: ${event.markets.length}`);
        for (const m of event.markets) {
            console.log(`  - ${m.title} (${m.outcomes.length} outcomes)`);
        }
    } else {
        console.log('Event not found');
    }
};

main();
