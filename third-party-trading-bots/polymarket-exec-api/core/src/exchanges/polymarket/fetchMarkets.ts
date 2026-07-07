import axios, { AxiosInstance } from 'axios';
import { MarketFetchParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { GAMMA_API_URL, GAMMA_SEARCH_URL, mapMarketToUnified, paginateParallel, paginateSearchParallel } from './utils';
import { polymarketErrorMapper } from './errors';

export async function fetchMarkets(params?: MarketFetchParams, http: AxiosInstance = axios): Promise<UnifiedMarket[]> {
    try {
        // Handle marketId lookup (Gamma market condition ID)
        if (params?.marketId) {
            return await fetchMarketById(params.marketId, http);
        }

        // Handle slug-based lookup
        if (params?.slug) {
            return await fetchMarketsBySlug(params.slug, http);
        }

        // Handle outcomeId lookup (CLOB token ID -- no direct API, fetch and filter)
        if (params?.outcomeId) {
            const markets = await fetchMarketsDefault(params, http);
            return markets.filter(m =>
                m.outcomes.some(o => o.outcomeId === params.outcomeId)
            );
        }

        // Handle eventId lookup (Gamma event ID)
        if (params?.eventId) {
            return await fetchMarketsByEventId(params.eventId, http);
        }

        // Handle query-based search
        if (params?.query) {
            return await searchMarkets(params.query, params, http);
        }

        // Default: fetch markets
        return await fetchMarketsDefault(params, http);
    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}

async function fetchMarketById(marketId: string, http: AxiosInstance): Promise<UnifiedMarket[]> {
    const GAMMA_MARKETS_URL = 'https://gamma-api.polymarket.com/markets';
    const response = await http.get(GAMMA_MARKETS_URL, {
        params: { id: marketId }
    });

    const markets = response.data;
    if (!markets || markets.length === 0) return [];

    const unifiedMarkets: UnifiedMarket[] = [];

    for (const market of markets) {
        // The /markets endpoint returns markets with an embedded 'events' array
        const event = market.events?.[0] || market;
        const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
        if (unifiedMarket) {
            unifiedMarkets.push(unifiedMarket);
        }
    }
    return unifiedMarkets;
}

async function fetchMarketsByEventId(eventId: string, http: AxiosInstance): Promise<UnifiedMarket[]> {
    const response = await http.get(GAMMA_API_URL, {
        params: { id: eventId }
    });

    const events = response.data;
    if (!events || events.length === 0) return [];

    const unifiedMarkets: UnifiedMarket[] = [];

    for (const event of events) {
        if (!event.markets) continue;

        for (const market of event.markets) {
            const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
            if (unifiedMarket) {
                unifiedMarkets.push(unifiedMarket);
            }
        }
    }
    return unifiedMarkets;
}

async function fetchMarketsBySlug(slug: string, http: AxiosInstance): Promise<UnifiedMarket[]> {
    const response = await http.get(GAMMA_API_URL, {
        params: { slug: slug }
    });

    const events = response.data;
    if (!events || events.length === 0) return [];

    const unifiedMarkets: UnifiedMarket[] = [];

    for (const event of events) {
        if (!event.markets) continue;

        for (const market of event.markets) {
            const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
            if (unifiedMarket) {
                unifiedMarkets.push(unifiedMarket);
            }
        }
    }
    return unifiedMarkets;
}

async function searchMarkets(query: string, params: MarketFetchParams | undefined, http: AxiosInstance): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 250000;

    // Use parallel pagination to fetch all matching events
    // Each event can contain multiple markets, so we need a larger pool
    const queryParams: any = {
        q: query,
        limit_per_type: 50, // Fetch 50 events per page
        events_status: params?.status === 'all' ? undefined : (params?.status === 'inactive' || params?.status === 'closed' ? 'closed' : 'active'),
        sort: 'volume',
        ascending: false
    };

    // Fetch events with parallel pagination
    const events = await paginateSearchParallel(GAMMA_SEARCH_URL, queryParams, limit * 5, http);

    const unifiedMarkets: UnifiedMarket[] = [];
    const lowerQuery = query.toLowerCase();
    const searchIn = params?.searchIn || 'title';

    // Flatten events into markets
    for (const event of events) {
        if (!event.markets) continue;

        for (const market of event.markets) {
            const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
            if (!unifiedMarket) continue;

            // Apply client-side filtering on market title
            const titleMatch = (unifiedMarket.title || '').toLowerCase().includes(lowerQuery);
            const descMatch = (unifiedMarket.description || '').toLowerCase().includes(lowerQuery);

            let matches = false;
            if (searchIn === 'title') matches = titleMatch;
            else if (searchIn === 'description') matches = descMatch;
            else matches = titleMatch || descMatch;

            if (matches) {
                unifiedMarkets.push(unifiedMarket);
            }
        }
    }

    return unifiedMarkets.slice(0, limit);
}

async function fetchMarketsDefault(params: MarketFetchParams | undefined, http: AxiosInstance): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 250000;  // Higher default for better coverage
    const offset = params?.offset || 0;

    // Map generic sort params to Polymarket Gamma API params
    let queryParams: any = {
        limit: limit,
        offset: offset,
    };

    const status = params?.status || 'active';

    if (status === 'active') {
        queryParams.active = 'true';
        queryParams.closed = 'false';
    } else if (status === 'closed' || status === 'inactive') {
        queryParams.active = 'false';
        queryParams.closed = 'true';
    } else {
        // 'all' - don't filter by status
    }

    // Gamma API uses 'order' and 'ascending' for sorting
    if (params?.sort === 'volume') {
        queryParams.order = 'volume';
        queryParams.ascending = 'false';
    } else if (params?.sort === 'newest') {
        queryParams.order = 'startDate';
        queryParams.ascending = 'false';
    } else if (params?.sort === 'liquidity') {
        // queryParams.order = 'liquidity';
    } else {
        // Default to volume sort to ensure we get active markets
        queryParams.order = 'volume';
        queryParams.ascending = 'false';
    }

    try {
        // Fetch active events from Gamma using parallel pagination
        const events = await paginateParallel(GAMMA_API_URL, queryParams, http);
        const unifiedMarkets: UnifiedMarket[] = [];

        for (const event of events) {
            // Each event is a container (e.g. "US Election").
            // It contains specific "markets" (e.g. "Winner", "Pop Vote").
            if (!event.markets) continue;

            for (const market of event.markets) {
                const unifiedMarket = mapMarketToUnified(event, market);
                if (unifiedMarket) {
                    unifiedMarkets.push(unifiedMarket);
                }
            }
        }

        // Client-side Sort capability to ensure contract fulfillment
        // Often API filters are "good effort" or apply to the 'event' but not the 'market'
        if (params?.sort === 'volume') {
            unifiedMarkets.sort((a, b) => b.volume24h - a.volume24h);
        } else if (params?.sort === 'newest') {
            // unifiedMarkets.sort((a, b) => b.resolutionDate.getTime() - a.resolutionDate.getTime()); // Not quite 'newest'
        } else if (params?.sort === 'liquidity') {
            unifiedMarkets.sort((a, b) => b.liquidity - a.liquidity);
        } else {
            // Default volume sort
            unifiedMarkets.sort((a, b) => b.volume24h - a.volume24h);
        }

        // Respect limit strictly after flattening
        return unifiedMarkets.slice(0, limit);

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
