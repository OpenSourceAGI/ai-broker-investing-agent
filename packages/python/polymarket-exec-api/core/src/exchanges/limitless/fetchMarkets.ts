import { MarketFetchParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { LIMITLESS_API_URL, mapMarketToUnified, paginateLimitlessMarkets } from './utils';
import { limitlessErrorMapper } from './errors';

export async function fetchMarkets(
    params?: MarketFetchParams,
    apiKey?: string,
    callApi?: (operationId: string, params?: Record<string, any>) => Promise<any>
): Promise<UnifiedMarket[]> {
    // Limitless API currently only supports fetching active markets for lists
    // Early return to avoid SDK initialization in tests
    if (params?.status === 'inactive' || params?.status === 'closed') {
        return [];
    }

    // Lazy import SDK to avoid initialization when not needed
    const { HttpClient, MarketFetcher } = await import('@limitless-exchange/sdk');

    try {
        // Create HTTP client (no auth needed for market data)
        const httpClient = new HttpClient({
            baseURL: LIMITLESS_API_URL,
            apiKey: apiKey, // Optional - not required for public market data
        });

        const marketFetcher = new MarketFetcher(httpClient);

        // Handle marketId lookup (Limitless marketId is the slug)
        if (params?.marketId) {
            return await fetchMarketsBySlug(marketFetcher, params.marketId);
        }

        // Handle slug-based lookup
        if (params?.slug) {
            return await fetchMarketsBySlug(marketFetcher, params.slug);
        }

        // Handle outcomeId lookup (no direct API, fetch and filter client-side)
        if (params?.outcomeId) {
            const markets = await fetchMarketsDefault(marketFetcher, params);
            return markets.filter(m =>
                m.outcomes.some(o => o.outcomeId === params.outcomeId)
            );
        }

        // Handle eventId lookup (same as slug for Limitless)
        if (params?.eventId) {
            return await fetchMarketsBySlug(marketFetcher, params.eventId);
        }

        // Handle query-based search
        if (params?.query) {
            return await searchMarkets(params.query, params, callApi!);
        }

        // Default: fetch active markets
        return await fetchMarketsDefault(marketFetcher, params);
    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}

async function fetchMarketsBySlug(
    marketFetcher: any,
    slug: string
): Promise<UnifiedMarket[]> {
    const market = await marketFetcher.getMarket(slug);

    if (!market) return [];

    const unifiedMarket = mapMarketToUnified(market);
    return unifiedMarket ? [unifiedMarket] : [];
}

async function searchMarkets(
    query: string,
    params: MarketFetchParams | undefined,
    callApi: (operationId: string, params?: Record<string, any>) => Promise<any>
): Promise<UnifiedMarket[]> {
    // NOTE: The Limitless /markets/search endpoint currently only returns active/funded markets.
    // It does not include expired or resolved markets in search results.
    const data = await callApi('MarketSearchController_search', {
        query: query,
        limit: params?.limit || 250000,
        page: params?.page || 1,
        similarityThreshold: params?.similarityThreshold || 0.5,
    });

    const rawResults = data?.markets || [];
    const allMarkets: UnifiedMarket[] = [];

    for (const res of rawResults) {
        if (res.markets && Array.isArray(res.markets)) {
            // It's a group market, extract individual markets
            for (const child of res.markets) {
                const mapped = mapMarketToUnified(child);
                if (mapped) allMarkets.push(mapped);
            }
        } else {
            const mapped = mapMarketToUnified(res);
            if (mapped) allMarkets.push(mapped);
        }
    }

    return allMarkets
        .filter((m: any): m is UnifiedMarket => m !== null && m.outcomes.length > 0)
        .slice(0, params?.limit || 250000);
}

async function fetchMarketsDefault(
    marketFetcher: any,
    params?: MarketFetchParams
): Promise<UnifiedMarket[]> {
    const limit = params?.limit || 250000;
    const offset = params?.offset || 0;

    // Map sort parameter to SDK's sortBy
    let sortBy: 'lp_rewards' | 'ending_soon' | 'newest' | 'high_value' = 'lp_rewards';
    if (params?.sort === 'volume') {
        sortBy = 'high_value';
    }

    try {
        // Use pagination utility to handle limits > 25
        // The utility over-fetches to account for markets that get filtered out
        const totalToFetch = limit + offset;
        const rawMarkets = await paginateLimitlessMarkets(marketFetcher, totalToFetch, sortBy);

        // Map and filter markets
        const unifiedMarkets: UnifiedMarket[] = [];

        for (const market of rawMarkets) {
            const unifiedMarket = mapMarketToUnified(market);
            // Only include markets that are valid and have outcomes (compliance requirement)
            if (unifiedMarket && unifiedMarket.outcomes.length > 0) {
                unifiedMarkets.push(unifiedMarket);
            }
        }

        // If local sorting is needed (SDK already sorts by sortBy parameter)
        if (params?.sort === 'volume') {
            unifiedMarkets.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
        }

        // Apply offset and limit to the FILTERED results
        const marketsAfterOffset = offset > 0 ? unifiedMarkets.slice(offset) : unifiedMarkets;
        return marketsAfterOffset.slice(0, limit);
    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}
