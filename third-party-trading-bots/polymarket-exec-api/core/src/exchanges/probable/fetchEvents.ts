import { EventFetchParams } from '../../BaseExchange';
import { UnifiedEvent } from '../../types';
import axios, { AxiosInstance } from 'axios';
import { BASE_URL, SEARCH_PATH, EVENTS_PATH, mapEventToUnified, enrichMarketsWithPrices } from './utils';
import { probableErrorMapper } from './errors';

export async function fetchEvents(params: EventFetchParams, http: AxiosInstance = axios, callMidpoint?: (tokenId: string) => Promise<any>, callSearch?: (params: any) => Promise<any>): Promise<UnifiedEvent[]> {
    try {
        // Handle eventId lookup
        if (params.eventId) {
            const event = await fetchEventById(params.eventId, http, callMidpoint);
            return event ? [event] : [];
        }

        // Handle slug lookup
        if (params.slug) {
            const event = await fetchEventBySlug(params.slug, http, callMidpoint);
            return event ? [event] : [];
        }

        // Query-based search: use the search endpoint (only endpoint with text search)
        if (params.query) {
            return await searchEvents(params, http, callMidpoint, callSearch);
        }

        // Default: use the dedicated events API for listing
        return await fetchEventsList(params, http, callMidpoint);
    } catch (error: any) {
        throw probableErrorMapper.mapError(error);
    }
}

export async function fetchEventById(id: string, http: AxiosInstance = axios, callMidpoint?: (tokenId: string) => Promise<any>): Promise<UnifiedEvent | null> {
    try {
        const numericId = Number(id);
        if (isNaN(numericId)) return null;

        const response = await http.get(`${BASE_URL}${EVENTS_PATH}${numericId}`);
        const event = mapEventToUnified(response.data);
        if (event && callMidpoint) await enrichMarketsWithPrices(event.markets, callMidpoint);
        return event;
    } catch (error: any) {
        if (isNotFoundError(error)) return null;
        throw probableErrorMapper.mapError(error);
    }
}

export async function fetchEventBySlug(slug: string, http: AxiosInstance = axios, callMidpoint?: (tokenId: string) => Promise<any>): Promise<UnifiedEvent | null> {
    try {
        const response = await http.get(`${BASE_URL}${EVENTS_PATH}slug/${slug}`);
        const event = mapEventToUnified(response.data);
        if (event && callMidpoint) await enrichMarketsWithPrices(event.markets, callMidpoint);
        return event;
    } catch (error: any) {
        if (isNotFoundError(error)) return null;
        throw probableErrorMapper.mapError(error);
    }
}

async function fetchEventsList(params: EventFetchParams, http: AxiosInstance, callMidpoint?: (tokenId: string) => Promise<any>): Promise<UnifiedEvent[]> {
    const limit = params.limit || 20;
    const page = params.offset ? Math.floor(params.offset / limit) + 1 : 1;

    const queryParams: Record<string, any> = {
        page,
        limit,
    };

    // Map status
    if (params.status) {
        switch (params.status) {
            case 'active':
                queryParams.status = 'active';
                break;
            case 'inactive':
            case 'closed':
                queryParams.status = 'closed';
                break;
            case 'all':
                queryParams.status = 'all';
                break;
        }
    } else {
        queryParams.status = 'active';
    }

    // Default sort by volume
    queryParams.sort = 'volume';
    queryParams.ascending = false;

    const response = await http.get(`${BASE_URL}${EVENTS_PATH}`, {
        params: queryParams,
    });

    const events = response.data?.events || [];

    const result = events
        .map((event: any) => mapEventToUnified(event))
        .filter((e: any): e is UnifiedEvent => e !== null);
    const allMarkets = result.flatMap((e: UnifiedEvent) => e.markets);
    if (callMidpoint) await enrichMarketsWithPrices(allMarkets, callMidpoint);
    return result;
}

async function searchEvents(params: EventFetchParams, http: AxiosInstance, callMidpoint?: (tokenId: string) => Promise<any>, callSearch?: (params: any) => Promise<any>): Promise<UnifiedEvent[]> {
    const limit = params.limit || 20;
    const page = params.offset ? Math.floor(params.offset / limit) + 1 : 1;

    const queryParams = {
        q: params.query,
        page,
        limit,
        events_status: mapStatus(params.status),
        keep_closed_markets: params.status === 'all' || params.status === 'inactive' || params.status === 'closed' ? 1 : 0,
    };

    const searchData = callSearch
        ? await callSearch(queryParams)
        : (await http.get(`${BASE_URL}${SEARCH_PATH}`, { params: queryParams })).data;

    const events = searchData?.events || [];

    const result = events
        .map((event: any) => mapEventToUnified(event))
        .filter((e: any): e is UnifiedEvent => e !== null);
    const allMarkets = result.flatMap((e: UnifiedEvent) => e.markets);
    if (callMidpoint) await enrichMarketsWithPrices(allMarkets, callMidpoint);
    return result;
}

function isNotFoundError(error: any): boolean {
    const status = error.response?.status;
    if (status === 404 || status === 400) return true;
    // API returns 500 with plain-text "not found" message for missing resources
    if (status === 500) {
        const data = error.response?.data;
        const msg = typeof data === 'string' ? data : (data?.detail || data?.message || '');
        return /not found/i.test(String(msg));
    }
    return false;
}

function mapStatus(status?: string): string {
    switch (status) {
        case 'inactive':
        case 'closed':
            return 'closed';
        case 'all':
            return 'all';
        case 'active':
        default:
            return 'active';
    }
}
