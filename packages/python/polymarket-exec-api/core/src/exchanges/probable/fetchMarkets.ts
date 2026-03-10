import { MarketFetchParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import axios, { AxiosInstance } from 'axios';
import { BASE_URL, SEARCH_PATH, MARKETS_PATH, mapMarketToUnified, enrichMarketsWithPrices } from './utils';
import { probableErrorMapper } from './errors';

export async function fetchMarkets(params?: MarketFetchParams, http: AxiosInstance = axios, callMidpoint?: (tokenId: string) => Promise<any>, callSearch?: (params: any) => Promise<any>): Promise<UnifiedMarket[]> {
    try {
        // Handle marketId lookup (numeric ID or slug)
        if (params?.marketId) {
            return await fetchMarketByIdOrSlug(params.marketId, http, callMidpoint, callSearch);
        }

        // Slug-based lookup: try market ID or slug via dedicated endpoint
        if (params?.slug) {
            return await fetchMarketByIdOrSlug(params.slug, http, callMidpoint, callSearch);
        }

        // Handle outcomeId lookup (no direct API, fetch and filter client-side)
        if (params?.outcomeId) {
            const markets = await fetchMarketsList(params, http, callMidpoint);
            return markets.filter(m =>
                m.outcomes.some(o => o.outcomeId === params.outcomeId)
            );
        }

        // Handle eventId lookup (use markets list with eventId param)
        if (params?.eventId) {
            return await fetchMarketsList(params, http, callMidpoint);
        }

        // Query-based search: use the search endpoint (only endpoint with text search)
        if (params?.query) {
            return await searchAndExtractMarkets(params.query, params, http, callMidpoint, callSearch);
        }

        // Default: use the dedicated markets API for listing
        return await fetchMarketsList(params, http, callMidpoint);
    } catch (error: any) {
        throw probableErrorMapper.mapError(error);
    }
}

async function fetchMarketByIdOrSlug(slug: string, http: AxiosInstance, callMidpoint?: (tokenId: string) => Promise<any>, callSearch?: (params: any) => Promise<any>): Promise<UnifiedMarket[]> {
    let cleanSlug = slug;
    let marketIdFromQuery: string | null = null;

    // Handle URLs or partial URLs with query params (e.g., opinion-...-launch?market=584)
    if (slug.includes('?')) {
        try {
            const urlParts = slug.split('?');
            cleanSlug = urlParts[0];
            const query = urlParts[1];
            const params = new URLSearchParams(query);
            marketIdFromQuery = params.get('market');

            // If we have a market ID from the query, try that first
            if (marketIdFromQuery) {
                const result = await fetchMarketByIdOrSlug(marketIdFromQuery, http, callMidpoint);
                if (result.length > 0) return result;
            }
        } catch (e) {
            // Fall back to original slug if parsing fails
        }
    }

    // Try numeric ID lookup first
    const numericId = Number(cleanSlug);
    if (!isNaN(numericId) && String(numericId) === cleanSlug) {
        try {
            const response = await http.get(`${BASE_URL}${MARKETS_PATH}${numericId}`);
            const mapped = mapMarketToUnified(response.data, response.data?.event);
            const results = mapped ? [mapped] : [];
            if (callMidpoint) await enrichMarketsWithPrices(results, callMidpoint);
            return results;
        } catch (error: any) {
            if (isMarketNotFoundError(error)) {
                // Individual market endpoint returned 500/404; fall back to list and filter
                const allMarkets = await fetchMarketsList({ limit: 100 }, http, callMidpoint);
                const match = allMarkets.filter(m => m.marketId === cleanSlug);
                if (match.length > 0) return match;
            } else {
                throw error;
            }
        }
    }

    // Fall back to search for slug-based matching
    return await searchAndExtractMarkets(cleanSlug, { slug: cleanSlug }, http, callMidpoint, callSearch);
}

async function fetchMarketsList(params: MarketFetchParams | undefined, http: AxiosInstance, callMidpoint?: (tokenId: string) => Promise<any>): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 20;
    const page = params?.offset ? Math.floor(params.offset / limit) + 1 : 1;

    const queryParams: Record<string, any> = {
        page,
        limit,
    };

    // Map status filters
    if (params?.status) {
        switch (params.status) {
            case 'active':
                queryParams.active = true;
                break;
            case 'inactive':
            case 'closed':
                queryParams.closed = true;
                break;
            case 'all':
                // No filter
                break;
        }
    } else {
        queryParams.active = true;
    }

    // Map event_id if provided
    if ((params as any)?.eventId) {
        queryParams.event_id = (params as any).eventId;
    }

    const response = await http.get(`${BASE_URL}${MARKETS_PATH}`, {
        params: queryParams,
    });

    const markets = response.data?.markets || [];
    const allMarkets: UnifiedMarket[] = [];

    for (const market of markets) {
        const mapped = mapMarketToUnified(market, market.event);
        if (mapped) allMarkets.push(mapped);
    }

    if (callMidpoint) await enrichMarketsWithPrices(allMarkets, callMidpoint);
    return allMarkets;
}

async function searchAndExtractMarkets(
    query: string,
    params: MarketFetchParams | undefined,
    http: AxiosInstance,
    callMidpoint?: (tokenId: string) => Promise<any>,
    callSearch?: (params: any) => Promise<any>
): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 20;
    const page = params?.offset ? Math.floor(params.offset / limit) + 1 : 1;

    // Improve search for slugs: if the query looks like a slug (has dashes), 
    // try searching with the first few words as keywords.
    // The Probable search engine often fails with long, exact slug-like queries.
    let searchQuery = query;
    if (query.includes('-')) {
        const tokens = query.split('-');
        // Use first 3 tokens for search to cast a wider but relevant net
        searchQuery = tokens.slice(0, 3).join(' ');
    }

    const queryParams: Record<string, any> = {
        q: searchQuery,
        page,
        limit,
    };

    // Map status
    if (params?.status) {
        switch (params.status) {
            case 'inactive':
            case 'closed':
                queryParams.events_status = 'closed';
                queryParams.keep_closed_markets = 1;
                break;
            case 'all':
                queryParams.events_status = 'all';
                queryParams.keep_closed_markets = 1;
                break;
            case 'active':
            default:
                queryParams.events_status = 'active';
                queryParams.keep_closed_markets = 0;
                break;
        }
    } else if (params?.slug) {
        // For slug lookups, default to 'all' status to be safe
        queryParams.events_status = 'all';
        queryParams.keep_closed_markets = 1;
    } else {
        queryParams.events_status = 'active';
        queryParams.keep_closed_markets = 0;
    }

    // Map sort
    if (params?.sort) {
        switch (params.sort) {
            case 'volume':
                queryParams.sort = 'volume';
                break;
            case 'newest':
                queryParams.sort = 'created_at';
                queryParams.ascending = false;
                break;
        }
    }

    const searchData = callSearch
        ? await callSearch(queryParams)
        : (await http.get(`${BASE_URL}${SEARCH_PATH}`, { params: queryParams })).data;

    const events = searchData?.events || [];
    const allMarkets: UnifiedMarket[] = [];

    for (const event of events) {
        if (event.markets && Array.isArray(event.markets)) {
            for (const market of event.markets) {
                const mapped = mapMarketToUnified(market, event);
                if (mapped) {
                    // Inject a temporary field for slug matching
                    (mapped as any)._eventSlug = event.slug;
                    allMarkets.push(mapped);
                }
            }
        }
    }

    // If slug lookup, try to find exact match
    if (params?.slug) {
        const exact = allMarkets.filter(
            m => m.marketId === params.slug ||
                m.url.includes(params.slug!) ||
                (m as any)._eventSlug === params.slug
        );

        // Remove temporary fields before returning
        for (const m of exact) {
            delete (m as any)._eventSlug;
        }
        if (exact.length > 0) {
            if (callMidpoint) await enrichMarketsWithPrices(exact, callMidpoint);
            return exact;
        }
    }
    // Clean up temporary fields for all markets if no exact match found
    for (const m of allMarkets) {
        delete (m as any)._eventSlug;
    }

    if (callMidpoint) await enrichMarketsWithPrices(allMarkets, callMidpoint);
    return allMarkets;
}

function isMarketNotFoundError(error: any): boolean {
    const status = error.response?.status;
    if (status === 404 || status === 400) return true;
    if (status === 500) {
        const data = error.response?.data;
        const msg = typeof data === 'string' ? data : (data?.detail || data?.message || '');
        return /not found|failed to retrieve/i.test(String(msg));
    }
    return false;
}
