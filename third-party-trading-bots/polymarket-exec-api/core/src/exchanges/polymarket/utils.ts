import { UnifiedMarket, MarketOutcome, CandleInterval } from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';

export const GAMMA_API_URL = 'https://gamma-api.polymarket.com/events';
export const GAMMA_SEARCH_URL = 'https://gamma-api.polymarket.com/public-search';
export const CLOB_API_URL = 'https://clob.polymarket.com';
export const DATA_API_URL = 'https://data-api.polymarket.com';

export function mapMarketToUnified(event: any, market: any, options: { useQuestionAsCandidateFallback?: boolean } = {}): UnifiedMarket | null {
    if (!market) return null;

    const outcomes: MarketOutcome[] = [];

    // Polymarket Gamma often returns 'outcomes' and 'outcomePrices' as stringified JSON keys.
    let outcomeLabels: string[] = [];
    let outcomePrices: string[] = [];

    try {
        outcomeLabels = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : (market.outcomes || []);
        outcomePrices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : (market.outcomePrices || []);
    } catch (e) {
        console.warn(`Error parsing outcomes for market ${market.id}:`, e);
    }

    // Extract CLOB token IDs for granular operations
    let clobTokenIds: string[] = [];
    try {
        clobTokenIds = typeof market.clobTokenIds === 'string' ? JSON.parse(market.clobTokenIds) : (market.clobTokenIds || []);
    } catch (e) {
        // console.warn(`Error parsing clobTokenIds for market ${market.id}`, e);
    }

    // Extract candidate/option name from market question for better outcome labels
    let candidateName: string | null = null;
    if (market.groupItemTitle) {
        candidateName = market.groupItemTitle;
    } else if (market.question && options.useQuestionAsCandidateFallback) {
        // Fallback or sometimes question is the candidate name in nested structures
        // Only used if explicitly requested (e.g. for getMarketsBySlug)
        candidateName = market.question;
    }

    if (outcomeLabels.length > 0) {
        outcomeLabels.forEach((label: string, index: number) => {
            const rawPrice = outcomePrices[index] || "0";

            // For Yes/No markets with specific candidates, use the candidate name
            let outcomeLabel = label;
            if (candidateName && label.toLowerCase() === 'yes') {
                outcomeLabel = candidateName;
            } else if (candidateName && label.toLowerCase() === 'no') {
                outcomeLabel = `Not ${candidateName}`;
            }

            // 24h Price Change
            // Polymarket API provides 'oneDayPriceChange' on the market object
            let priceChange = 0;
            if (index === 0 || label.toLowerCase() === 'yes' || (candidateName && label === candidateName)) {
                priceChange = Number(market.oneDayPriceChange || 0);
            }

            const outcomeIdValue = clobTokenIds[index] || String(index);
            outcomes.push({
                outcomeId: outcomeIdValue,
                marketId: market.id,
                label: outcomeLabel,
                price: parseFloat(rawPrice) || 0,
                priceChange24h: priceChange,
                metadata: {
                    // clobTokenId is now the main ID, but keeping it in metadata for backward compat if needed
                    clobTokenId: clobTokenIds[index]
                }
            });
        });
    }

    const um = {
        id: market.id,
        marketId: market.id,
        eventId: event.id || event.slug,
        title: market.question ? `${event.title} - ${market.question}` : event.title,
        description: market.description || event.description,
        outcomes: outcomes,
        resolutionDate: market.endDate ? new Date(market.endDate) : (market.end_date_iso ? new Date(market.end_date_iso) : new Date()),
        volume24h: Number(market.volume24hr || market.volume_24h || 0),
        volume: Number(market.volume || 0),
        liquidity: Number(market.liquidity || market.rewards?.liquidity || 0),
        openInterest: Number(market.openInterest || market.open_interest || 0),
        url: `https://polymarket.com/event/${event.slug}`,
        image: event.image || market.image || `https://polymarket.com/api/og?slug=${event.slug}`,
        category: event.category || event.tags?.[0]?.label,
        tags: event.tags?.map((t: any) => t.label) || []
    } as UnifiedMarket;

    addBinaryOutcomes(um);
    return um;
}

export function mapIntervalToFidelity(interval: CandleInterval): number {
    const mapping: Record<CandleInterval, number> = {
        '1m': 1,
        '5m': 5,
        '15m': 15,
        '1h': 60,
        '6h': 360,
        '1d': 1440
    };
    return mapping[interval];
}

/**
 * Fetch all results from Gamma API using parallel pagination for best DX.
 * Polymarket Gamma API has a hard limit of 500 results per request.
 */
export async function paginateParallel(url: string, params: any, http: any, maxResults: number = 10000): Promise<any[]> {
    const PAGE_SIZE = 500;
    const initialLimit = Math.min(params.limit || PAGE_SIZE, PAGE_SIZE);

    // 1. Fetch the first page to see if we even need more
    const firstPageResponse = await http.get(url, {
        params: { ...params, limit: initialLimit, offset: 0 }
    });

    const firstPage = firstPageResponse.data || [];

    // If the first page isn't full, or we specifically asked for a small amount, we're done
    if (firstPage.length < initialLimit || (params.limit && params.limit <= PAGE_SIZE)) {
        return firstPage;
    }

    // 2. Determine how many more pages to fetch
    const targetLimit = params.limit || maxResults;
    const numPages = Math.ceil(targetLimit / PAGE_SIZE);

    const offsets = [];
    for (let i = 1; i < numPages; i++) {
        offsets.push(i * PAGE_SIZE);
    }

    // 3. Fetch remaining pages in parallel
    const remainingPages = await Promise.all(offsets.map(async (offset) => {
        try {
            const res = await http.get(url, {
                params: { ...params, limit: PAGE_SIZE, offset }
            });
            return res.data || [];
        } catch (e) {
            return []; // Swallow individual page errors to be robust
        }
    }));

    return [firstPage, ...remainingPages].flat();
}

/**
 * Fetch all results from Gamma public-search API using parallel pagination.
 * Uses 'page' parameter instead of 'offset'.
 */
export async function paginateSearchParallel(url: string, params: any, maxResults: number = 10000, http: any): Promise<any[]> {
    // 1. Fetch the first page to check pagination info
    const firstPageResponse = await http.get(url, {
        params: { ...params, page: 1 }
    });

    const data = firstPageResponse.data;
    const firstPageEvents = data.events || [];
    const pagination = data.pagination;

    // If no more pages, return what we have
    if (!pagination?.hasMore || firstPageEvents.length === 0) {
        return firstPageEvents;
    }

    // 2. Calculate how many pages to fetch based on totalResults and limit_per_type
    const limitPerType = params.limit_per_type || 20;
    const totalResults = Math.min(pagination.totalResults || 0, maxResults);
    const totalPages = Math.ceil(totalResults / limitPerType);

    // Fetch remaining pages in parallel
    const pageNumbers = [];
    for (let i = 2; i <= totalPages; i++) {
        pageNumbers.push(i);
    }

    const remainingPages = await Promise.all(pageNumbers.map(async (pageNum) => {
        try {
            const res = await http.get(url, {
                params: { ...params, page: pageNum }
            });
            return res.data?.events || [];
        } catch (e) {
            return []; // Swallow individual page errors to be robust
        }
    }));

    return [firstPageEvents, ...remainingPages].flat();
}

