import { Connection } from '@solana/web3.js';
import { OrderBook } from '../../types';
import { fetchSingleMarket } from './fetchMarkets';
import { baoziErrorMapper } from './errors';

/**
 * Pari-mutuel markets don't have a real order book.
 * We synthesize one that represents the current pool state:
 * - bid = ask = implied probability from pool ratios
 * - size = total pool in SOL
 *
 * This honestly represents pari-mutuel: there's one "price"
 * (the implied probability) and you can bet any amount into it.
 */
export async function fetchOrderBook(
    connection: Connection,
    outcomeId: string,
): Promise<OrderBook> {
    try {
        const marketPubkey = outcomeId.replace(/-YES$|-NO$|-\d+$/, '');
        const market = await fetchSingleMarket(connection, marketPubkey);

        if (!market) {
            throw new Error(`Market not found: ${marketPubkey}`);
        }

        // Find the outcome matching the requested ID
        const outcome = market.outcomes.find(o => o.outcomeId === outcomeId);
        const price = outcome?.price ?? 0.5;
        const totalLiquidity = market.liquidity;

        // Single price level representing the entire pool
        return {
            bids: [{ price, size: totalLiquidity }],
            asks: [{ price, size: totalLiquidity }],
            timestamp: Date.now(),
        };
    } catch (error: any) {
        throw baoziErrorMapper.mapError(error);
    }
}
