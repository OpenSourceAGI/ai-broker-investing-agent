/**
 * Polymarket position tracker (ported/adapted from PredictOS `polymarket-position-tracker`).
 *
 * Fetches and calculates position data for Polymarket 15-minute up/down markets.
 * Shows filled orders, average costs, and profit lock status.
 */

import { PolymarketClient, createClientFromEnv } from "../clients/polymarket/client";
import {
  buildMarketSlug,
  createLogEntry,
} from "../clients/polymarket/utils";
import type { SupportedAsset, BotLogEntry } from "../clients/polymarket/types";
import type {
  PositionTrackerRequest,
  PositionTrackerResponse,
} from "./polymarketPositionTracker.types";

/**
 * Validate that the asset is supported
 */
function isValidAsset(asset: string): asset is SupportedAsset {
  return ["BTC", "SOL", "ETH", "XRP"].includes(asset.toUpperCase());
}

/**
 * Get current UTC timestamp in seconds
 */
function nowUtcSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get the current 15-minute market timestamp
 * Returns the most recent 15-minute block (the current active market)
 */
function getCurrent15MinTimestamp(): number {
  const now = nowUtcSeconds();
  return Math.floor(now / 900) * 900;
}

/**
 * Fetch the current position for a Polymarket 15-minute up/down market.
 */
export async function polymarketPositionTracker(
  input: PositionTrackerRequest,
): Promise<PositionTrackerResponse> {
  const logs: BotLogEntry[] = [];

  try {
    const { asset, marketSlug: customSlug, tokenIds: customTokenIds } = input;

    // Validate asset
    if (!asset || !isValidAsset(asset)) {
      logs.push(createLogEntry("ERROR", "Invalid or missing asset", { asset }));
      return {
        success: false,
        error: "Invalid asset. Must be one of: BTC, SOL, ETH, XRP",
        logs,
      };
    }

    const normalizedAsset = asset.toUpperCase() as SupportedAsset;

    // Initialize the Polymarket client
    let client: PolymarketClient;
    try {
      client = createClientFromEnv();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logs.push(createLogEntry("ERROR", `Failed to initialize client: ${errorMsg}`));
      return {
        success: false,
        error: `Client initialization failed: ${errorMsg}`,
        logs,
      };
    }

    // Determine market slug
    const timestamp = getCurrent15MinTimestamp();
    const marketSlug = customSlug || buildMarketSlug(normalizedAsset, timestamp);

    logs.push(createLogEntry("INFO", `Checking position for market: ${marketSlug}`));

    // Get token IDs (either from request or fetch from market)
    let tokenIds = customTokenIds;
    let marketTitle: string | undefined;

    if (!tokenIds) {
      // Fetch market to get token IDs
      const market = await client.getMarketBySlug(marketSlug);
      logs.push(...client.getLogs());
      client.clearLogs();

      if (!market) {
        logs.push(createLogEntry("WARN", "Market not found - may not be created yet"));
        return {
          success: false,
          error: "Market not found - may not be created yet",
          logs,
        };
      }

      marketTitle = market.title;

      try {
        tokenIds = client.extractTokenIds(market);
        logs.push(...client.getLogs());
        client.clearLogs();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logs.push(createLogEntry("ERROR", `Failed to extract token IDs: ${errorMsg}`));
        return {
          success: false,
          error: `Token extraction failed: ${errorMsg}`,
          logs,
        };
      }
    }

    // Get position
    const position = await client.getMarketPosition(marketSlug, tokenIds, marketTitle);
    logs.push(...client.getLogs());
    client.clearLogs();

    // Build response
    return {
      success: true,
      data: {
        asset: normalizedAsset,
        position,
      },
      logs,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logs.push(createLogEntry("ERROR", `Unhandled error: ${errorMsg}`));

    return {
      success: false,
      error: errorMsg,
      logs,
    };
  }
}
