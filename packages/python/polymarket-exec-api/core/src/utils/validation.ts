import { ValidationError } from '../errors';

/**
 * Validates that the provided ID is an outcomeId
 * Numeric IDs should be at least 10 digits (CLOB Token IDs for Polymarket)
 */
export function validateOutcomeId(id: string, context: string): void {
    // Polymarket: CLOB Token IDs are long (>= 10 digits)
    // Short numeric IDs are invalid for trading operations
    if (id.length < 10 && /^\d+$/.test(id)) {
        throw new ValidationError(
            `Invalid outcome ID for ${context}: "${id}". ` +
            `Numeric outcome IDs must be at least 10 digits. Please use the correct outcome ID.`,
            'id'
        );
    }
}

export function validateIdFormat(id: string, context: string): void {
    if (!id || id.trim().length === 0) {
        throw new ValidationError(
            `Invalid ID for ${context}: ID cannot be empty`,
            'id'
        );
    }
}
