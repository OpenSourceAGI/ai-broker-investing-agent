/**
 * Dome API endpoint functions
 * @see https://docs.domeapi.io/
 */

import { request } from './client';
import type {
  PolymarketMarketsResponse,
  KalshiMarketsResponse,
  KalshiMarket,
  PaginationParams,
} from './types';

// ============================================================================
// Polymarket Endpoints
// ============================================================================

/**
 * Gets Polymarket markets
 * @param params Pagination and filter parameters
 * @returns Promise resolving to markets list
 */
export async function getPolymarketMarkets(
  params?: PaginationParams & {
    active?: boolean;
    closed?: boolean;
    market_slug?: string;
    slug?: string;
  }
): Promise<PolymarketMarketsResponse> {
  return request<PolymarketMarketsResponse>('/polymarket/markets', {
    params: params as Record<string, string | number | boolean | undefined>,
  });
}

// ============================================================================
// Kalshi Endpoints
// ============================================================================

/**
 * Gets Kalshi markets
 * @param params Pagination and filter parameters
 * @returns Promise resolving to markets list
 */
async function getKalshiMarkets(
  params?: PaginationParams & {
    eventTicker?: string;
    status?: 'open' | 'closed' | 'settled';
  }
): Promise<KalshiMarketsResponse> {
  return request<KalshiMarketsResponse>('/kalshi/markets', {
    params: {
      cursor: params?.cursor,
      limit: params?.limit,
      event_ticker: params?.eventTicker,
      status: params?.status,
    },
  });
}

/**
 * Gets Kalshi markets by event ticker
 * @param eventTicker Event ticker identifier
 * @param status Market status filter
 * @returns Promise resolving to markets list
 *
 * @example
 * getKalshiMarketsByEvent("KXBTC-25DEC")
 */
export async function getKalshiMarketsByEvent(
  eventTicker: string,
  status: 'open' | 'closed' | 'settled' = 'open'
): Promise<KalshiMarket[]> {
  const response = await getKalshiMarkets({
    eventTicker,
    status,
    limit: 100, // Dome API max limit is 100
  });
  return response.markets;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Builds a Kalshi market URL from a market ticker
 * Extracts the first segment before "-" and constructs the URL
 *
 * @example
 * buildKalshiMarketUrl("KXBTCD-25DEC1217-T89999.99") // returns "https://kalshi.com/markets/KXBTCD"
 *
 * @param ticker Market ticker string
 * @returns Kalshi market URL
 */
export function buildKalshiMarketUrl(ticker: string): string {
  const firstElement = ticker.split("-")[0];
  return `https://kalshi.com/markets/${firstElement}`;
}

/**
 * Builds a Polymarket event URL from a market slug
 * @param slug Event slug identifier
 * @returns Polymarket event URL
 */
export function buildPolymarketUrl(slug: string): string {
  return `https://polymarket.com/event/${slug}`;
}
