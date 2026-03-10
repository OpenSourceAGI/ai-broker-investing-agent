import { MarketFetchParams } from "../../BaseExchange";
import { UnifiedMarket } from "../../types";
import { mapMarketToUnified } from "./utils";
import { kalshiErrorMapper } from "./errors";

type CallApi = (
  operationId: string,
  params?: Record<string, any>,
) => Promise<any>;

async function fetchActiveEvents(
  callApi: CallApi,
  targetMarketCount?: number,
  status: string = "open",
): Promise<any[]> {
  let allEvents: any[] = [];
  let totalMarketCount = 0;
  let cursor = null;
  let page = 0;

  // Note: Kalshi API uses cursor-based pagination which requires sequential fetching.
  // We cannot parallelize requests for a single list because we need the cursor from page N to fetch page N+1.
  // To optimize, we use the maximum allowed limit (200) and fetch until exhaustion.

  const MAX_PAGES = 1000; // Safety cap against infinite loops
  const BATCH_SIZE = 200; // Max limit per Kalshi API docs

  do {
    try {
      const queryParams: any = {
        limit: BATCH_SIZE,
        with_nested_markets: true,
        status: status, // Filter by status (default 'open')
      };
      if (cursor) queryParams.cursor = cursor;

      const data = await callApi("GetEvents", queryParams);
      const events = data.events || [];

      if (events.length === 0) break;

      allEvents = allEvents.concat(events);

      // Count markets in this batch for early termination
      if (targetMarketCount) {
        for (const event of events) {
          totalMarketCount += (event.markets || []).length;
        }

        // Early termination: if we have enough markets, stop fetching
        // Use 1.5x multiplier to ensure we have enough for sorting/filtering
        if (totalMarketCount >= targetMarketCount * 1.5) {
          break;
        }
      }

      cursor = data.cursor;
      page++;

      // Additional safety: if no target specified, limit to reasonable number of pages
      if (!targetMarketCount && page >= 10) {
        break;
      }
    } catch (e: any) {
      throw kalshiErrorMapper.mapError(e);
    }
  } while (cursor && page < MAX_PAGES);

  return allEvents;
}

async function fetchSeriesMap(
  callApi: CallApi,
): Promise<Map<string, string[]>> {
  try {
    const data = await callApi("GetSeriesList");
    const seriesList = data.series || [];
    const map = new Map<string, string[]>();
    for (const series of seriesList) {
      if (series.tags && series.tags.length > 0) {
        map.set(series.ticker, series.tags);
      }
    }

    return map;
  } catch (e: any) {
    throw kalshiErrorMapper.mapError(e);
  }
}

// Simple in-memory cache to avoid redundant API calls within a short period
let cachedEvents: any[] | null = null;
let cachedSeriesMap: Map<string, string[]> | null = null;
let lastCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Export a function to reset the cache (useful for testing)
export function resetCache(): void {
  cachedEvents = null;
  cachedSeriesMap = null;
  lastCacheTime = 0;
}

export async function fetchMarkets(
  params: MarketFetchParams | undefined,
  callApi: CallApi,
): Promise<UnifiedMarket[]> {
  try {
    // Handle marketId lookup (Kalshi marketId is the ticker)
    if (params?.marketId) {
      return await fetchMarketsBySlug(params.marketId, callApi);
    }

    // Handle slug-based lookup (event ticker)
    if (params?.slug) {
      return await fetchMarketsBySlug(params.slug, callApi);
    }

    // Handle outcomeId lookup (strip -NO suffix, use as ticker)
    if (params?.outcomeId) {
      const ticker = params.outcomeId.replace(/-NO$/, "");
      return await fetchMarketsBySlug(ticker, callApi);
    }

    // Handle eventId lookup (event ticker works the same way)
    if (params?.eventId) {
      return await fetchMarketsBySlug(params.eventId, callApi);
    }

    // Handle query-based search
    if (params?.query) {
      return await searchMarkets(params.query, params, callApi);
    }

    // Default: fetch markets
    return await fetchMarketsDefault(params, callApi);
  } catch (error: any) {
    throw kalshiErrorMapper.mapError(error);
  }
}

async function fetchMarketsBySlug(
  eventTicker: string,
  callApi: CallApi,
): Promise<UnifiedMarket[]> {
  // Kalshi API expects uppercase tickers, but URLs use lowercase
  const normalizedTicker = eventTicker.toUpperCase();
  const data = await callApi("GetEvent", {
    event_ticker: normalizedTicker,
    with_nested_markets: true,
  });

  const event = data.event;
  if (!event) return [];

  // Enrichment: Fetch series tags if they exist
  if (event.series_ticker) {
    try {
      const seriesData = await callApi("GetSeries", {
        series_ticker: event.series_ticker,
      });
      const series = seriesData.series;
      if (series && series.tags && series.tags.length > 0) {
        if (!event.tags || event.tags.length === 0) {
          event.tags = series.tags;
        }
      }
    } catch (e) {
      // Ignore errors fetching series info - non-critical
    }
  }

  const unifiedMarkets: UnifiedMarket[] = [];
  const markets = event.markets || [];

  for (const market of markets) {
    const unifiedMarket = mapMarketToUnified(event, market);
    if (unifiedMarket) {
      unifiedMarkets.push(unifiedMarket);
    }
  }

  return unifiedMarkets;
}

async function searchMarkets(
  query: string,
  params: MarketFetchParams | undefined,
  callApi: CallApi,
): Promise<UnifiedMarket[]> {
  // We must fetch ALL markets to search them locally since we don't have server-side search
  const searchLimit = 250000;
  const markets = await fetchMarketsDefault(
    { ...params, limit: searchLimit },
    callApi,
  );
  const lowerQuery = query.toLowerCase();
  const searchIn = params?.searchIn || "title"; // Default to title-only search

  const filtered = markets.filter((market) => {
    const titleMatch = (market.title || "").toLowerCase().includes(lowerQuery);
    const descMatch = (market.description || "")
      .toLowerCase()
      .includes(lowerQuery);

    if (searchIn === "title") return titleMatch;
    if (searchIn === "description") return descMatch;
    return titleMatch || descMatch; // 'both'
  });

  const limit = params?.limit || 250000;
  return filtered.slice(0, limit);
}

async function fetchMarketsDefault(
  params: MarketFetchParams | undefined,
  callApi: CallApi,
): Promise<UnifiedMarket[]> {
  const limit = params?.limit || 250000;
  const offset = params?.offset || 0;
  const now = Date.now();
  const status = params?.status || "active"; // Default to 'active'

  // Map 'active' -> 'open', 'closed' -> 'closed'
  // Kalshi statuses: 'open', 'closed', 'settled'
  let apiStatus = "open";
  if (status === "closed" || status === "inactive") apiStatus = "closed";
  else if (status === "all") apiStatus = "open"; // Fallback for all? Or loop? For now default to open.

  try {
    let events: any[];
    let seriesMap: Map<string, string[]>;

    // Check if we have valid cached data
    // Only use global cache for the default 'active'/'open' case
    const useCache = status === "active" || !params?.status;

    if (
      useCache &&
      cachedEvents &&
      cachedSeriesMap &&
      now - lastCacheTime < CACHE_TTL
    ) {
      events = cachedEvents;
      seriesMap = cachedSeriesMap;
    } else {
      // Optimize fetch limit based on request parameters
      // If sorting is required (e.g. by volume), we need to fetch a larger set (or all) to sort correctly.
      // If no sorting is requested, we only need to fetch enough to satisfy the limit.
      const isSorted =
        params?.sort &&
        (params.sort === "volume" || params.sort === "liquidity");
      const fetchLimit = isSorted ? 1000 : limit;

      const [allEvents, fetchedSeriesMap] = await Promise.all([
        fetchActiveEvents(callApi, fetchLimit, apiStatus),
        fetchSeriesMap(callApi),
      ]);

      events = allEvents;
      seriesMap = fetchedSeriesMap;

      // Cache the dataset ONLY if:
      // 1. We fetched a comprehensive set (>= 1000)
      // 2. It's the standard 'open' status query
      if (fetchLimit >= 1000 && useCache) {
        cachedEvents = allEvents;
        cachedSeriesMap = fetchedSeriesMap;
        lastCacheTime = now;
      }
    }

    // Extract ALL markets from all events
    const allMarkets: UnifiedMarket[] = [];
    // ... rest of the logic

    for (const event of events) {
      // Enrich event with tags from Series
      if (event.series_ticker && seriesMap.has(event.series_ticker)) {
        // If event has no tags or empty tags, use series tags
        if (!event.tags || event.tags.length === 0) {
          event.tags = seriesMap.get(event.series_ticker);
        }
      }

      const markets = event.markets || [];
      for (const market of markets) {
        const unifiedMarket = mapMarketToUnified(event, market);
        if (unifiedMarket) {
          allMarkets.push(unifiedMarket);
        }
      }
    }

    // Sort by 24h volume
    if (params?.sort === "volume") {
      allMarkets.sort((a, b) => b.volume24h - a.volume24h);
    } else if (params?.sort === "liquidity") {
      allMarkets.sort((a, b) => b.liquidity - a.liquidity);
    }

    return allMarkets.slice(offset, offset + limit);
  } catch (error: any) {
    throw kalshiErrorMapper.mapError(error);
  }
}
