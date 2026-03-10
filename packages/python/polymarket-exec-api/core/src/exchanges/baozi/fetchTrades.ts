import { Trade } from '../../types';

/**
 * Baozi has no trade history API without a custom indexer.
 * Returns an empty array.
 */
export async function fetchTrades(): Promise<Trade[]> {
    return [];
}
