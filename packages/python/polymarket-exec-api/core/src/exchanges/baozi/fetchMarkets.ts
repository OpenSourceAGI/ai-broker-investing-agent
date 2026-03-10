import { Connection } from '@solana/web3.js';
import { MarketFetchParams } from '../../BaseExchange';
import { UnifiedMarket } from '../../types';
import {
    PROGRAM_ID,
    MARKET_DISCRIMINATOR_BS58,
    RACE_MARKET_DISCRIMINATOR_BS58,
    MarketStatus,
    STATUS_NAMES,
    parseMarket,
    parseRaceMarket,
    mapBooleanToUnified,
    mapRaceToUnified,
    Cache,
} from './utils';
import { baoziErrorMapper } from './errors';

const marketsCache = new Cache<UnifiedMarket[]>(30_000); // 30s TTL

export async function fetchMarkets(
    connection: Connection,
    params?: MarketFetchParams,
): Promise<UnifiedMarket[]> {
    try {
        // Use cache for default (no-filter) fetches
        if (!params?.query && !params?.slug) {
            const cached = marketsCache.get();
            if (cached) {
                return applyFilters(cached, params);
            }
        }

        // Fetch boolean and race markets in parallel
        const [booleanAccounts, raceAccounts] = await Promise.all([
            connection.getProgramAccounts(PROGRAM_ID, {
                filters: [{ memcmp: { offset: 0, bytes: MARKET_DISCRIMINATOR_BS58 } }],
            }),
            connection.getProgramAccounts(PROGRAM_ID, {
                filters: [{ memcmp: { offset: 0, bytes: RACE_MARKET_DISCRIMINATOR_BS58 } }],
            }),
        ]);

        const markets: UnifiedMarket[] = [];

        // Parse boolean markets
        for (const account of booleanAccounts) {
            try {
                const parsed = parseMarket(account.account.data);
                markets.push(mapBooleanToUnified(parsed, account.pubkey.toString()));
            } catch {
                // Skip malformed accounts
            }
        }

        // Parse race markets
        for (const account of raceAccounts) {
            try {
                const parsed = parseRaceMarket(account.account.data);
                markets.push(mapRaceToUnified(parsed, account.pubkey.toString()));
            } catch {
                // Skip malformed accounts
            }
        }

        // Cache results
        marketsCache.set(markets);

        return applyFilters(markets, params);
    } catch (error: any) {
        throw baoziErrorMapper.mapError(error);
    }
}

export async function fetchSingleMarket(
    connection: Connection,
    pubkey: string,
): Promise<UnifiedMarket | null> {
    try {
        const { PublicKey } = await import('@solana/web3.js');
        const pk = new PublicKey(pubkey);
        const accountInfo = await connection.getAccountInfo(pk);
        if (!accountInfo) return null;

        const data = accountInfo.data;
        const discriminator = data.subarray(0, 8);

        // Check if it's a boolean market
        if (Buffer.from(discriminator).equals(Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]))) {
            const parsed = parseMarket(data);
            return mapBooleanToUnified(parsed, pubkey);
        }

        // Check if it's a race market
        if (Buffer.from(discriminator).equals(Buffer.from([235, 196, 111, 75, 230, 113, 118, 238]))) {
            const parsed = parseRaceMarket(data);
            return mapRaceToUnified(parsed, pubkey);
        }

        return null;
    } catch {
        return null;
    }
}

function applyFilters(markets: UnifiedMarket[], params?: MarketFetchParams): UnifiedMarket[] {
    let result = [...markets];

    // Status filter
    const status = params?.status || 'active';
    if (status !== 'all') {
        const now = Date.now();
        if (status === 'active') {
            result = result.filter(m => m.resolutionDate.getTime() > now);
        } else {
            // 'inactive' / 'closed'
            result = result.filter(m => m.resolutionDate.getTime() <= now);
        }
    }

    // Text search
    if (params?.query) {
        const lowerQuery = params.query.toLowerCase();
        const searchIn = params.searchIn || 'title';

        result = result.filter(m => {
            const titleMatch = m.title.toLowerCase().includes(lowerQuery);
            const descMatch = (m.description || '').toLowerCase().includes(lowerQuery);

            if (searchIn === 'title') return titleMatch;
            if (searchIn === 'description') return descMatch;
            return titleMatch || descMatch; // 'both'
        });
    }

    // Sort
    if (params?.sort === 'volume') {
        result.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    } else if (params?.sort === 'liquidity') {
        result.sort((a, b) => b.liquidity - a.liquidity);
    } else if (params?.sort === 'newest') {
        result.sort((a, b) => b.resolutionDate.getTime() - a.resolutionDate.getTime());
    } else {
        // Default: sort by volume
        result.sort((a, b) => (b.volume || 0) - (a.volume || 0));
    }

    // Pagination
    const offset = params?.offset || 0;
    const limit = params?.limit || 10000;
    result = result.slice(offset, offset + limit);

    return result;
}
