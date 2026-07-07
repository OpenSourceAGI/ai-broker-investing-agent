import { HistoryFilterParams, TradesParams } from '../../BaseExchange';
import { Trade } from '../../types';
import { validateIdFormat, validateOutcomeId } from '../../utils/validation';
import { polymarketErrorMapper } from './errors';

/**
 * Fetch raw trade history for a specific token.
 * @param id - The CLOB token ID
 *
 * NOTE: Uses Polymarket Data API (public) to fetch trades.
 */
export async function fetchTrades(id: string, params: TradesParams | HistoryFilterParams, callApi: (operationId: string, params?: Record<string, any>) => Promise<any>): Promise<Trade[]> {
    validateIdFormat(id, 'Trades');
    validateOutcomeId(id, 'Trades');

    try {
        const queryParams: any = {
            asset_id: id // Uses asset_id for Token ID on Data API
        };

        // Add time filters if provided
        if (params.start) {
            queryParams.after = Math.floor(params.start.getTime() / 1000);
        }
        if (params.end) {
            queryParams.before = Math.floor(params.end.getTime() / 1000);
        }

        const trades = await callApi('getTrades', queryParams) || [];

        const mappedTrades: Trade[] = trades.map((trade: any) => ({
            id: trade.id || `${trade.timestamp}-${trade.price}`,
            timestamp: trade.timestamp * 1000, // Convert to milliseconds
            price: parseFloat(trade.price),
            amount: parseFloat(trade.size || trade.amount || 0),
            side: trade.side === 'BUY' ? 'buy' : trade.side === 'SELL' ? 'sell' : 'unknown'
        }));

        // Apply limit if specified
        if (params.limit && mappedTrades.length > params.limit) {
            return mappedTrades.slice(0, params.limit); // Return most recent N trades
        }

        return mappedTrades;

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
