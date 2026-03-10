import { OrderBook } from '../../types';
import { validateIdFormat } from '../../utils/validation';

// Limitless uses USDC with 6 decimals
const USDC_DECIMALS = 6;
const USDC_SCALE = Math.pow(10, USDC_DECIMALS);

/**
 * Convert raw orderbook size from smallest unit to human-readable USDC amount.
 */
function convertSize(rawSize: number): number {
    return rawSize / USDC_SCALE;
}

/**
 * Fetch the current order book for a specific market.
 * @param id - The market slug (preferred) or CLOB token ID
 */
export async function fetchOrderBook(id: string, callApi: (operationId: string, params?: Record<string, any>) => Promise<any>): Promise<OrderBook> {
    validateIdFormat(id, 'OrderBook');

    try {
        const data = await callApi('MarketOrderbookController_getOrderbook', { slug: id });

        // Response format: { bids: [{price: 0.52, size: 100000000}], asks: [...] }
        // Sizes are in smallest unit (USDC with 6 decimals), convert to human-readable
        const bids = (data.bids || []).map((level: any) => ({
            price: parseFloat(level.price),
            size: convertSize(parseFloat(level.size))
        })).sort((a: any, b: any) => b.price - a.price);

        const asks = (data.asks || []).map((level: any) => ({
            price: parseFloat(level.price),
            size: convertSize(parseFloat(level.size))
        })).sort((a: any, b: any) => a.price - b.price);

        return {
            bids,
            asks,
            timestamp: Date.now() // API doesn't seem to return a specific timestamp in the root anymore
        };

    } catch (error: any) {
        return { bids: [], asks: [] };
    }
}
