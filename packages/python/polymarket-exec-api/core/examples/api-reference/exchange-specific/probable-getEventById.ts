import pmxt from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    const event = await api.getEventById('180');

    if (event) {
        console.log(`Event: ${event.title}`);
        console.log(`Markets: ${event.markets.length}`);
        for (const m of event.markets) {
            console.log(`  - ${m.title}`);
        }
    } else {
        console.log('Event not found');
    }
};

main();
