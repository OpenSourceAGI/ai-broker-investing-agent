/**
 * Script to sync top 1000 active Polymarket markets with holders
 *
 * Usage:
 *   npx tsx scripts/sync-1000-markets.ts
 *   npx tsx scripts/sync-1000-markets.ts --no-prices
 *   npx tsx scripts/sync-1000-markets.ts --no-holders
 */

import "dotenv/config";
import { syncMarketsIncremental } from "../../../packages/investing/src/prediction/sync/incremental-markets";

async function main() {
  const args = process.argv.slice(2);
  const syncPrices = !args.includes("--no-prices");
  const syncHolders = !args.includes("--no-holders");

  console.log("🚀 Starting sync of top 1000 active markets...");
  console.log(`   Sync price history: ${syncPrices}`);
  console.log(`   Sync holders: ${syncHolders}`);
  console.log();

  const startTime = Date.now();

  try {
    const result = await syncMarketsIncremental(1000, syncPrices, syncHolders);

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

    console.log();
    console.log("✅ Sync completed successfully!");
    console.log();
    console.log("📊 Results:");
    console.log(`   Markets synced: ${result.markets}`);
    console.log(`   Price data points: ${result.pricePoints}`);
    console.log(`   Price history updates: ${result.priceHistoryUpdates}`);
    console.log(`   Total holders: ${result.holders}`);
    console.log(`   Holder updates: ${result.holderUpdates}`);
    console.log(`   Duration: ${duration} minutes`);
  } catch (error) {
    console.error("❌ Sync failed:", error);
    process.exit(1);
  }
}

main();
