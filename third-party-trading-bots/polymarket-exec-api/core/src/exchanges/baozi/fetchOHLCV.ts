import { PriceCandle } from '../../types';

/**
 * Baozi has no historical price/trade API without a custom indexer.
 * Returns an empty array.
 */
export async function fetchOHLCV(): Promise<PriceCandle[]> {
    return [];
}
