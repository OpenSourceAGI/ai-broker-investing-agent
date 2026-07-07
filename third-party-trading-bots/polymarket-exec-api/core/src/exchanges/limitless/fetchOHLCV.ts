import { HistoryFilterParams, OHLCVParams } from '../../BaseExchange';
import { PriceCandle } from '../../types';
import { mapIntervalToFidelity } from './utils';
import { validateIdFormat } from '../../utils/validation';
import { limitlessErrorMapper } from './errors';

/**
 * Fetch historical price data (candles) for a specific market.
 * @param id - The market slug
 */
export async function fetchOHLCV(id: string, params: OHLCVParams | HistoryFilterParams, callApi: (operationId: string, params?: Record<string, any>) => Promise<any>): Promise<PriceCandle[]> {
    validateIdFormat(id, 'OHLCV');

    // Validate resolution is provided
    if (!params.resolution) {
        throw new Error('fetchOHLCV requires a resolution parameter. Use OHLCVParams with resolution specified.');
    }

    try {
        const fidelity = mapIntervalToFidelity(params.resolution);

        const data = await callApi('MarketOrderbookController_getHistoricalPrice', { slug: id, fidelity });
        const prices = data.prices || [];

        // Map price points to pmxt PriceCandle format
        // The API returns price points, so we treat each point as a candle
        let candles = prices.map((p: any) => {
            const price = Number(p.price);
            const ts = Number(p.timestamp);

            return {
                timestamp: ts,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0 // Volume not provided in this specific endpoint
            };
        }).sort((a: any, b: any) => a.timestamp - b.timestamp);

        if (params.start) {
            candles = candles.filter((c: any) => c.timestamp >= params.start!.getTime());
        }
        if (params.end) {
            candles = candles.filter((c: any) => c.timestamp <= params.end!.getTime());
        }
        if (params.limit) {
            candles = candles.slice(0, params.limit);
        }

        return candles;

    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}
