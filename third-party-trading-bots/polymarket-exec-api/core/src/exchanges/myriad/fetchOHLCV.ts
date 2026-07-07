import { OHLCVParams, HistoryFilterParams } from '../../BaseExchange';
import { PriceCandle, CandleInterval } from '../../types';
import { myriadErrorMapper } from './errors';

// Myriad provides price charts via GET /markets/:id with these timeframes:
// - 24h: 5-minute buckets (max 288)
// - 7d: 30-minute buckets (max 336)
// - 30d: 4-hour buckets (max 180)
// - all: 4-hour buckets

function selectTimeframe(interval: CandleInterval): string {
    switch (interval) {
        case '1m':
        case '5m':
            return '24h';
        case '15m':
        case '1h':
            return '7d';
        case '6h':
        case '1d':
            return '30d';
        default:
            return '7d';
    }
}

export async function fetchOHLCV(
    id: string,
    params: OHLCVParams | HistoryFilterParams,
    callApi: (operationId: string, params?: Record<string, any>) => Promise<any>
): Promise<PriceCandle[]> {
    if (!params.resolution) {
        throw new Error('fetchOHLCV requires a resolution parameter.');
    }

    try {
        // id format: {networkId}:{marketId}:{outcomeId}
        // We need the marketId and networkId to fetch the market, then extract the outcome's price_charts
        const parts = id.split(':');
        if (parts.length < 2) {
            throw new Error(`Invalid Myriad outcome ID format: "${id}". Expected "{networkId}:{marketId}:{outcomeId}".`);
        }

        const networkId = parts[0];
        const marketId = parts[1];
        const outcomeId = parts.length >= 3 ? parts[2] : undefined;

        const response = await callApi('getMarkets', { id: marketId, network_id: Number(networkId) });
        const market = response.data || response;
        const outcomes = market.outcomes || [];

        // Find the target outcome
        let targetOutcome = outcomes[0];
        if (outcomeId !== undefined) {
            const found = outcomes.find((o: any) => String(o.id) === outcomeId);
            if (found) targetOutcome = found;
        }

        if (!targetOutcome || !targetOutcome.price_charts) {
            return [];
        }

        // price_charts is an object with numeric keys (0-3), each containing:
        // { timeframe: '24h'|'7d'|'30d'|'all', prices: [{value, timestamp, date}] }
        const desiredTimeframe = selectTimeframe(params.resolution);
        const charts = targetOutcome.price_charts;

        let prices: any[] | null = null;
        for (const key of Object.keys(charts)) {
            const chart = charts[key];
            if (chart && chart.timeframe === desiredTimeframe && Array.isArray(chart.prices)) {
                prices = chart.prices;
                break;
            }
        }

        if (!prices || prices.length === 0) {
            return [];
        }

        const candles: PriceCandle[] = prices.map((point: any) => ({
            timestamp: point.timestamp ? point.timestamp * 1000 : Date.now(),
            open: Number(point.value || 0),
            high: Number(point.value || 0),
            low: Number(point.value || 0),
            close: Number(point.value || 0),
            volume: undefined,
        }));

        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }

        return candles;
    } catch (error: any) {
        throw myriadErrorMapper.mapError(error);
    }
}
