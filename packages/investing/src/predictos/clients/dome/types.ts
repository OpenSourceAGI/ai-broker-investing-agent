/**
 * Type definitions for Dome API responses
 * @see https://docs.domeapi.io/
 */

// ============================================================================
// Polymarket Types
// ============================================================================

export interface PolymarketMarket {
  token_id: string;
  condition_id: string;
  question: string;
  slug: string;
  end_date: string;
  description?: string;
  outcomes: string[];
  outcome_prices: number[];
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  image?: string;
  icon?: string;
}

export interface PolymarketMarketsResponse {
  markets: PolymarketMarket[];
  next_cursor?: string;
}

// ============================================================================
// Kalshi Types
// ============================================================================

export interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  subtitle?: string;
  status: string;
  close_time: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  liquidity: number;
  open_interest: number;
}

export interface KalshiMarketsResponse {
  markets: KalshiMarket[];
  cursor?: string;
}

// ============================================================================
// Common Types
// ============================================================================

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}
