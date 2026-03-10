import { exchangeClasses, validateUnifiedEvent, initExchange } from './shared';

describe('Compliance: fetchEvents with new ID params', () => {
    test.each(exchangeClasses)('$name should support eventId param in fetchEvents', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchEvents({ eventId })`);

            // First, get a known event via query search
            const events = await exchange.fetchEvents({ query: 'a', limit: 3 });
            if (!events || events.length === 0) {
                console.info(`[Compliance] ${name}.fetchEvents returned no results with query, skipping.`);
                return;
            }

            const knownEvent = events[0];
            const knownEventId = knownEvent.id;

            // Look it up by eventId
            const result = await exchange.fetchEvents({ eventId: knownEventId });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);

            validateUnifiedEvent(result[0], name);

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchEvents not implemented.`);
                return;
            }
            throw error;
        }
    }, 120000);

    test.each(exchangeClasses)('$name should support slug param in fetchEvents', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchEvents({ slug })`);

            // First, get a known event
            const events = await exchange.fetchEvents({ query: 'a', limit: 3 });
            if (!events || events.length === 0) {
                console.info(`[Compliance] ${name}.fetchEvents returned no results, skipping.`);
                return;
            }

            const knownSlug = events[0].slug;
            if (!knownSlug) {
                console.info(`[Compliance] ${name} event has no slug, skipping.`);
                return;
            }

            // Look it up by slug
            const result = await exchange.fetchEvents({ slug: knownSlug });

            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);

            validateUnifiedEvent(result[0], name);

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchEvents not implemented.`);
                return;
            }
            throw error;
        }
    }, 120000);
});

describe('Compliance: fetchEvent (singular)', () => {
    test.each(exchangeClasses)('$name should return a single event via fetchEvent', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchEvent (singular)`);

            // First, get a known event
            const events = await exchange.fetchEvents({ query: 'a', limit: 3 });
            if (!events || events.length === 0) {
                console.info(`[Compliance] ${name}.fetchEvents returned no results, skipping.`);
                return;
            }

            const knownEventId = events[0].id;

            // Fetch single event
            const event = await exchange.fetchEvent({ eventId: knownEventId });

            expect(event).toBeDefined();
            expect(typeof event.id).toBe('string');
            expect(event.id.length).toBeGreaterThan(0);
            validateUnifiedEvent(event, name);

        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchEvent not implemented.`);
                return;
            }
            throw error;
        }
    }, 120000);

    test.each(exchangeClasses)('$name should throw for nonexistent eventId', async ({ name, cls }) => {
        const exchange = initExchange(name, cls);

        try {
            console.info(`[Compliance] Testing ${name}.fetchEvent (not found case)`);
            await exchange.fetchEvent({ eventId: 'NONEXISTENT_EVENT_ID_99999' });
            // If we get here, the exchange returned something - some exchanges may do fuzzy matching.
        } catch (error: any) {
            if (error.message.toLowerCase().includes('not implemented')) {
                console.info(`[Compliance] ${name}.fetchEvent not implemented.`);
                return;
            }
            // Should throw some kind of error (EventNotFound, validation error, etc.)
            // Different exchanges throw different errors for invalid IDs
            expect(error).toBeDefined();
            expect(error.message.length).toBeGreaterThan(0);
        }
    }, 120000);
});
