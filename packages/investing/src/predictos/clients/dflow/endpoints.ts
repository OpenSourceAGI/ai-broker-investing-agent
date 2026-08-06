/**
 * DFlow API endpoint functions
 * DFlow provides Kalshi market data as an alternative to Dome
 */

import { request } from './client';
import type { DFlowKalshiMarket, DFlowEventResponse } from './types';

// ============================================================================
// Kalshi Endpoints (via DFlow)
// ============================================================================

/**
 * Gets Kalshi markets by event ticker via DFlow API
 * @param eventTicker Event ticker identifier
 * @returns Promise resolving to markets list
 *
 * @example
 * getKalshiMarketsByEvent("KXBTC-25DEC")
 */
export async function getKalshiMarketsByEvent(
  eventTicker: string
): Promise<DFlowKalshiMarket[]> {
  const response = await request<DFlowEventResponse>(
    `/event/${eventTicker}`,
    {
      params: {
        withNestedMarkets: true,
      },
    }
  );
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
