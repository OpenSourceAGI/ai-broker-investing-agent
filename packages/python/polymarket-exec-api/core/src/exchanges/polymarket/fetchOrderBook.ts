import { OrderBook } from '../../types';
import { validateIdFormat, validateOutcomeId } from '../../utils/validation';
import { polymarketErrorMapper } from './errors';

/**
 * Fetch the current order book for a specific token.
 * @param id - The CLOB token ID
 */
export async function fetchOrderBook(id: string, callApi: (operationId: string, params?: Record<string, any>) => Promise<any>): Promise<OrderBook> {
    validateIdFormat(id, 'OrderBook');
    validateOutcomeId(id, 'OrderBook');

    try {
        const data = await callApi('getBook', { token_id: id });

        // Response format: { bids: [{price: "0.52", size: "100"}], asks: [...] }
        const bids = (data.bids || []).map((level: any) => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size)
        })).sort((a: { price: number, size: number }, b: { price: number, size: number }) => b.price - a.price); // Sort Bids Descending (Best/Highest first)

        const asks = (data.asks || []).map((level: any) => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size)
        })).sort((a: { price: number, size: number }, b: { price: number, size: number }) => a.price - b.price); // Sort Asks Ascending (Best/Lowest first)

        return {
            bids,
            asks,
            timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now()
        };

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
