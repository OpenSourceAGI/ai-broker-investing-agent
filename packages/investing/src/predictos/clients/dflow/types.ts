/**
 * Type definitions for DFlow API responses
 * DFlow provides Kalshi market data
 */

// ============================================================================
// Kalshi Market Types (via DFlow)
// ============================================================================

export interface DFlowKalshiMarket {
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

export interface DFlowEventResponse {
  event_ticker: string;
  title?: string;
  markets: DFlowKalshiMarket[];
}
