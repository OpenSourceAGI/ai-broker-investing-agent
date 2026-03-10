import { exchangeClasses } from './shared';

describe('Compliance: Identity (name)', () => {
    test.each(exchangeClasses)('$name should have a valid name property', ({ name, cls }) => {
        const exchange = new cls();

        expect(exchange.name).toBeDefined();
        expect(typeof exchange.name).toBe('string');
        expect(exchange.name.length).toBeGreaterThan(0);

        // The property name in the class should match the expected exchange name
        // (Removing 'Exchange' suffix from class name for comparison)
        const expectedName = name.replace('Exchange', '');
        expect(exchange.name.toLowerCase()).toContain(expectedName.toLowerCase());
    });
});
