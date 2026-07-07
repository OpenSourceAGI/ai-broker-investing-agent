import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../types';
import { LIMITLESS_API_URL, mapMarketToUnified } from './utils';
import { limitlessErrorMapper } from './errors';
import axios, { AxiosInstance } from 'axios';

async function fetchEventBySlug(slug: string, http: AxiosInstance = axios): Promise<UnifiedEvent | null> {
    const { HttpClient, MarketFetcher } = await import('@limitless-exchange/sdk');
    const httpClient = new HttpClient({ baseURL: LIMITLESS_API_URL });
    const marketFetcher = new MarketFetcher(httpClient);

    const market = await marketFetcher.getMarket(slug);
    if (!market) return null;

    let marketsList: UnifiedMarket[] = [];
    if (market.markets && Array.isArray(market.markets)) {
        marketsList = market.markets
            .map((child: any) => mapMarketToUnified(child))
            .filter((m: any): m is UnifiedMarket => m !== null);
    } else {
        const unifiedMarket = mapMarketToUnified(market);
        if (unifiedMarket) marketsList = [unifiedMarket];
    }

    const unifiedEvent = {
        id: market.slug,
        title: market.title || (market as any).question,
        description: market.description || '',
        slug: market.slug,
        markets: marketsList,
        url: `https://limitless.exchange/markets/${market.slug}`,
        image: (market as any).logo || `https://limitless.exchange/api/og?slug=${market.slug}`,
        category: market.categories?.[0],
        tags: market.tags || []
    } as UnifiedEvent;

    return unifiedEvent;
}

function rawMarketToEvent(market: any): UnifiedEvent {
    let marketsList: UnifiedMarket[] = [];

    if (market.markets && Array.isArray(market.markets)) {
        marketsList = market.markets
            .map((child: any) => mapMarketToUnified(child))
            .filter((m: any): m is UnifiedMarket => m !== null);
    } else {
        const unifiedMarket = mapMarketToUnified(market);
        if (unifiedMarket) marketsList = [unifiedMarket];
    }

    const unifiedEvent = {
        id: market.slug,
        title: market.title || market.question,
        description: market.description || '',
        slug: market.slug,
        markets: marketsList,
        url: `https://limitless.exchange/markets/${market.slug}`,
        image: market.logo || `https://limitless.exchange/api/og?slug=${market.slug}`,
        category: market.categories?.[0],
        tags: market.tags || []
    } as UnifiedEvent;

    return unifiedEvent;
}

export async function fetchEvents(
    params: EventFetchParams,
    callApi: (operationId: string, params?: Record<string, any>) => Promise<any>,
    http: AxiosInstance = axios
): Promise<UnifiedEvent[]> {
    try {
        // Handle eventId/slug lookup (same thing for Limitless)
        if (params.eventId || params.slug) {
            const slug = params.eventId || params.slug!;
            const event = await fetchEventBySlug(slug, http);
            return event ? [event] : [];
        }

        // Query-based search: use the /markets/search endpoint
        if (params.query) {
            return await searchEvents(params, callApi);
        }

        // Default: fetch active group markets from /markets/active
        // On Limitless, "events" = group markets (tradeType === 'group')
        return await fetchEventsDefault(params, http);

    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}

async function searchEvents(
    params: EventFetchParams,
    callApi: (operationId: string, params?: Record<string, any>) => Promise<any>
): Promise<UnifiedEvent[]> {
    // NOTE: The Limitless /markets/search endpoint currently only returns active/funded markets.
    const data = await callApi('MarketSearchController_search', {
        query: params.query,
        limit: params?.limit || 10000,
        similarityThreshold: 0.5,
    });

    let markets = data?.markets || [];

    const status = params?.status || 'active';
    if (status === 'active') {
        markets = markets.filter((m: any) => !m.expired && m.winningOutcomeIndex === null);
    } else if (status === 'inactive' || status === 'closed') {
        markets = markets.filter((m: any) => m.expired === true || m.winningOutcomeIndex !== null);
    }

    return markets.map(rawMarketToEvent);
}

async function fetchEventsDefault(params: EventFetchParams, http: AxiosInstance = axios): Promise<UnifiedEvent[]> {
    // Limitless has no dedicated /events endpoint.
    // Group markets (tradeType === 'group') are the semantic equivalent of events.
    // We use GET /markets/active and filter for groups only.
    const limit = params?.limit || 10000;
    let page = 1;
    const pageSize = 25; // Limitless API hard limit
    const MAX_PAGES = 40; // Safety cap
    const allGroups: UnifiedEvent[] = [];

    while (allGroups.length < limit && page <= MAX_PAGES) {
        const response = await http.get(`${LIMITLESS_API_URL}/markets/active`, {
            params: {
                page,
                limit: pageSize,
                tradeType: 'group',
                sortBy: params?.sort === 'newest' ? 'newest' : params?.sort === 'liquidity' ? 'lp_rewards' : 'high_value',
            }
        });

        const items: any[] = response.data?.data || response.data || [];
        if (items.length === 0) break;

        for (const item of items) {
            if (allGroups.length >= limit) break;
            const event = rawMarketToEvent(item);
            allGroups.push(event);
        }

        // If the page returned fewer items than the page size, we've reached the end
        if (items.length < pageSize) break;
        page++;
    }

    return allGroups;
}
