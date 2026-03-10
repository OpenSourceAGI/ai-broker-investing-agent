import axios, { AxiosInstance } from 'axios';
import { MarketFetchParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import { BASE_URL, mapMarketToUnified, mapStatusToMyriad } from './utils';
import { myriadErrorMapper } from './errors';

const MAX_PAGE_SIZE = 100;

export async function fetchMarkets(params?: MarketFetchParams, headers?: Record<string, string>, http: AxiosInstance = axios): Promise<UnifiedMarket[]> {
    try {
        if (params?.marketId) {
            return await fetchMarketById(params.marketId, headers, http);
        }

        if (params?.slug) {
            return await fetchMarketBySlug(params.slug, headers, http);
        }

        const limit = params?.limit || 100;
        const queryParams: any = {
            page: params?.page || 1,
            limit: Math.min(limit, MAX_PAGE_SIZE),
        };

        if (params?.query) {
            queryParams.keyword = params.query;
        }

        const myriadState = mapStatusToMyriad(params?.status);
        if (myriadState) {
            queryParams.state = myriadState;
        }

        if (params?.sort === 'volume') {
            queryParams.sort = 'volume';
            queryParams.order = 'desc';
        } else if (params?.sort === 'liquidity') {
            queryParams.sort = 'liquidity';
            queryParams.order = 'desc';
        } else if (params?.sort === 'newest') {
            queryParams.sort = 'published_at';
            queryParams.order = 'desc';
        }

        // If we need more than one page, paginate
        if (limit <= MAX_PAGE_SIZE) {
            const response = await http.get(`${BASE_URL}/markets`, {
                params: queryParams,
                headers,
            });
            const markets = response.data.data || response.data.markets || [];
            return markets.map(mapMarketToUnified).filter(Boolean) as UnifiedMarket[];
        }

        // Paginate through multiple pages
        const allMarkets: UnifiedMarket[] = [];
        let page = 1;
        const maxPages = Math.ceil(limit / MAX_PAGE_SIZE);

        while (page <= maxPages) {
            queryParams.page = page;
            queryParams.limit = MAX_PAGE_SIZE;

            const response = await http.get(`${BASE_URL}/markets`, {
                params: queryParams,
                headers,
            });

            const data = response.data;
            const markets = data.data || data.markets || [];

            for (const m of markets) {
                const um = mapMarketToUnified(m);
                if (um) allMarkets.push(um);
            }

            const pagination = data.pagination;
            if (!pagination?.hasNext || markets.length === 0) break;

            page++;
        }

        return allMarkets.slice(0, limit);
    } catch (error: any) {
        throw myriadErrorMapper.mapError(error);
    }
}

async function fetchMarketById(marketId: string, headers: Record<string, string> | undefined, http: AxiosInstance): Promise<UnifiedMarket[]> {
    // marketId format: {networkId}:{id}
    const parts = marketId.split(':');
    if (parts.length !== 2) {
        // Try as slug
        return fetchMarketBySlug(marketId, headers, http);
    }

    const [networkId, id] = parts;
    const response = await http.get(`${BASE_URL}/markets/${id}`, {
        params: { network_id: Number(networkId) },
        headers,
    });

    const market = response.data.data || response.data;
    const um = mapMarketToUnified(market);
    return um ? [um] : [];
}

async function fetchMarketBySlug(slug: string, headers: Record<string, string> | undefined, http: AxiosInstance): Promise<UnifiedMarket[]> {
    const response = await http.get(`${BASE_URL}/markets/${slug}`, { headers });
    const market = response.data.data || response.data;
    const um = mapMarketToUnified(market);
    return um ? [um] : [];
}
