import { Connection } from '@solana/web3.js';
import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent } from '../../types';
import { fetchMarkets } from './fetchMarkets';
import { baoziErrorMapper } from './errors';

/**
 * Baozi doesn't have Kalshi-style "events" (groups of related markets).
 * Each market IS an event. Simple 1:1 mapping.
 */
export async function fetchEvents(
    connection: Connection,
    params: EventFetchParams,
): Promise<UnifiedEvent[]> {
    try {
        const markets = await fetchMarkets(connection, {
            query: params.query,
            limit: params.limit,
            offset: params.offset,
            status: params.status,
            searchIn: params.searchIn,
        });

        return markets.map(m => {
            const unifiedEvent = {
                id: m.marketId,
                title: m.title,
                description: m.description,
                slug: m.marketId,
                markets: [m],
                url: m.url,
                image: m.image,
                category: m.category,
                tags: m.tags,
            };
            return unifiedEvent;
        });
    } catch (error: any) {
        throw baoziErrorMapper.mapError(error);
    }
}
