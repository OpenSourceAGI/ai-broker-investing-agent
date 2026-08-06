/**
 * Polymarket Utility Functions
 */

import type { SupportedAsset, BotLogEntry } from "./types";

/**
 * Asset slug prefixes for 15-minute up/down markets
 */
export const ASSET_SLUG_PREFIXES: Record<SupportedAsset, string> = {
  BTC: "btc-updown-15m-",
  SOL: "sol-updown-15m-",
  ETH: "eth-updown-15m-",
  XRP: "xrp-updown-15m-",
};

/**
 * Get the market slug for a given asset and timestamp
 */
export function buildMarketSlug(asset: SupportedAsset, timestamp: number): string {
  const prefix = ASSET_SLUG_PREFIXES[asset];
  return `${prefix}${timestamp}`;
}

/**
 * Format a Unix timestamp to a short time string (HH:MM:SS UTC)
 */
export function formatTimeShort(ts: number): string {
  const dt = new Date(ts * 1000);
  return dt.toISOString().slice(11, 19) + " UTC";
}

/**
 * Create a log entry with current timestamp
 */
export function createLogEntry(
  level: BotLogEntry["level"],
  message: string,
  details?: Record<string, unknown>
): BotLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    details,
  };
}

/**
 * Parse token IDs from market data
 * Returns [upTokenId, downTokenId]
 */
export function parseTokenIds(clobTokenIdsStr: string): [string, string] {
  const tokenIds = JSON.parse(clobTokenIdsStr);
  if (!Array.isArray(tokenIds) || tokenIds.length < 2) {
    throw new Error(`Expected 2 token IDs, got ${tokenIds.length}`);
  }
  // First token is Up, second is Down (based on outcomes: ["Up", "Down"])
  return [tokenIds[0], tokenIds[1]];
}
