import axios, { AxiosInstance } from 'axios';
import { createClobClient } from '@prob/clob';
import { TradesParams, HistoryFilterParams } from '../../BaseExchange';
import { Trade } from '../../types';
import { probableErrorMapper } from './errors';

/**
 * Fetch trade history for a specific token using the @prob/clob SDK.
 * @param id - The token ID (outcomeId)
 * @param params - Trade query parameters
 * @param client - Authenticated ClobClient instance
 */
export async function fetchTrades(
    id: string,
    params: TradesParams | HistoryFilterParams,
    client: any,
    http: AxiosInstance = axios
): Promise<Trade[]> {
    try {
        const queryParams: any = {
            tokenId: id,
        };

        if (params.limit) {
            queryParams.limit = params.limit;
        }

        const response = await client.getTrades(queryParams);
        const trades = Array.isArray(response) ? response : (response as any)?.data || [];

        return trades.map((trade: any) => ({
            id: String(trade.id || trade.tradeId || `${trade.time}-${trade.price}`),
            timestamp: typeof trade.time === 'number'
                ? (trade.time < 1e12 ? trade.time * 1000 : trade.time)
                : Date.now(),
            price: parseFloat(String(trade.price || '0')),
            amount: parseFloat(String(trade.qty || trade.size || trade.amount || '0')),
            side: trade.side === 'BUY' ? 'buy' as const
                : trade.side === 'SELL' ? 'sell' as const
                    : 'unknown' as const,
        }));
    } catch (error: any) {
        throw probableErrorMapper.mapError(error);
    }
}
