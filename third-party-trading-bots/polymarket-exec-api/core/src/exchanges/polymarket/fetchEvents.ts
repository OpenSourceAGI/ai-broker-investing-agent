import axios, { AxiosInstance } from 'axios';
import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../types';
import { GAMMA_API_URL, GAMMA_SEARCH_URL, mapMarketToUnified, paginateParallel, paginateSearchParallel } from './utils';
import { polymarketErrorMapper } from './errors';

function mapRawEventToUnified(event: any): UnifiedEvent {
    const markets: UnifiedMarket[] = [];
    if (event.markets && Array.isArray(event.markets)) {
        for (const market of event.markets) {
            const unifiedMarket = mapMarketToUnified(event, market, { useQuestionAsCandidateFallback: true });
            if (unifiedMarket) {
                markets.push(unifiedMarket);
            }
        }
    }
    const unifiedEvent: UnifiedEvent = {
        id: event.id || event.slug,
        title: event.title,
        description: event.description || '',
        slug: event.slug,
        markets: markets,
        url: `https://polymarket.com/event/${event.slug}`,
        image: event.image || `https://polymarket.com/api/og?slug=${event.slug}`,
        category: event.category || event.tags?.[0]?.label,
        tags: event.tags?.map((t: any) => t.label) || []
    };

    return unifiedEvent;
}

export async function fetchEvents(params: EventFetchParams, http: AxiosInstance = axios): Promise<UnifiedEvent[]> {
    try {
        const limit = params.limit || 10000;

        // Handle eventId or slug lookup (direct API call)
        if (params.eventId || params.slug) {
            const queryParams = params.eventId ? { id: params.eventId } : { slug: params.slug };
            const response = await http.get(GAMMA_API_URL, { params: queryParams });
            const events = response.data;
            if (!events || events.length === 0) return [];
            return events.map(mapRawEventToUnified).slice(0, limit);
        }

        // Handle query-based search (uses the /public-search endpoint)
        if (params.query) {
            return await searchEvents(params, limit, http);
        }

        // Default: fetch top events list from the Gamma /events endpoint (no query required)
        return await fetchEventsDefault(params, limit, http);

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}

async function searchEvents(params: EventFetchParams, limit: number, http: AxiosInstance): Promise<UnifiedEvent[]> {
    let sortParam = 'volume';
    if (params.sort === 'newest') sortParam = 'startDate';
    if (params.sort === 'liquidity') sortParam = 'liquidity';

    const queryParams: any = {
        q: params.query,
        limit_per_type: 50,
        sort: sortParam,
        ascending: false
    };

    const status = params.status || 'active';

    const fetchWithStatus = async (eventStatus: string | undefined) => {
        const currentParams = { ...queryParams, events_status: eventStatus };
        return paginateSearchParallel(GAMMA_SEARCH_URL, currentParams, limit * 10, http);
    };

    const filterActive = (e: any) => e.active === true;
    const filterClosed = (e: any) => e.closed === true;

    let events: any[] = [];
    if (status === 'all') {
        const [activeEvents, closedEvents] = await Promise.all([
            fetchWithStatus('active'),
            fetchWithStatus('closed')
        ]);
        const seenIds = new Set();
        events = [...activeEvents, ...closedEvents].filter(event => {
            const id = event.id || event.slug;
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
        });
    } else if (status === 'active') {
        const rawEvents = await fetchWithStatus('active');
        events = rawEvents.filter(filterActive);
    } else if (status === 'inactive' || status === 'closed') {
        const rawEvents = await fetchWithStatus('closed');
        events = rawEvents.filter(filterClosed);
    }

    const lowerQuery = params.query!.toLowerCase();
    const searchIn = params.searchIn || 'title';

    const filteredEvents = events.filter((event: any) => {
        const titleMatch = (event.title || '').toLowerCase().includes(lowerQuery);
        const descMatch = (event.description || '').toLowerCase().includes(lowerQuery);
        if (searchIn === 'title') return titleMatch;
        if (searchIn === 'description') return descMatch;
        return titleMatch || descMatch;
    });

    return filteredEvents.map(mapRawEventToUnified).slice(0, limit);
}

async function fetchEventsDefault(params: EventFetchParams, limit: number, http: AxiosInstance): Promise<UnifiedEvent[]> {
    const status = params.status || 'active';

    let sortParam = 'volume';
    if (params.sort === 'newest') sortParam = 'startDate';
    else if (params.sort === 'liquidity') sortParam = 'liquidity';

    const queryParams: any = {
        order: sortParam,
        ascending: false,
    };

    if (status === 'active') {
        queryParams.active = 'true';
        queryParams.closed = 'false';
    } else if (status === 'closed' || status === 'inactive') {
        queryParams.active = 'false';
        queryParams.closed = 'true';
    }
    // 'all' — no status filter applied

    const events = await paginateParallel(GAMMA_API_URL, queryParams, http, limit);
    return events.map(mapRawEventToUnified).slice(0, limit);
}
