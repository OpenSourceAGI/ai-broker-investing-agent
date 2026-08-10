#!/usr/bin/env tsx
/**
 * Script to sync trade history for top Polymarket traders.
 *
 * Usage:
 *   npx tsx scripts/sync-trade-history.ts [options]
 *
 * Options:
 *   --limit=N        Number of top traders to sync (default: 1000)
 *   --order-by=X     Sort by VOL or PNL (default: VOL)
 *   --time-period=X  Time period: all, 1d, 7d, 30d (default: all)
 *   --batch-size=N   Traders per batch (default: 10)
 *   --batch-delay=N  Delay between batches in ms (default: 1000)
 *   --skip-hours=N   Skip traders synced within N hours (default: 24)
 *   --resume         Resume syncing failed/pending traders
 */

import {
  syncTopTradersTradeHistory,
  resumeTradeHistorySync,
  getTradeHistorySyncProgress,
} from "../../../packages/investing/src/prediction/sync/trade-history";

async function main() {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const getArg = (name: string, defaultValue: string): string => {
    const arg = args.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.split("=")[1] : defaultValue;
  };

  const hasFlag = (name: string): boolean => {
    return args.includes(`--${name}`);
  };

  const limit = parseInt(getArg("limit", "1000"), 10);
  const orderBy = getArg("order-by", "VOL") as "VOL" | "PNL";
  const timePeriod = getArg("time-period", "all") as
    | "all"
    | "1d"
    | "7d"
    | "30d";
  const batchSize = parseInt(getArg("batch-size", "10"), 10);
  const batchDelay = parseInt(getArg("batch-delay", "1000"), 10);
  const skipHours = parseInt(getArg("skip-hours", "24"), 10);
  const resume = hasFlag("resume");

  console.log("Trade History Sync Configuration:");
  console.log("================================");
  console.log(`  Limit: ${limit} traders`);
  console.log(`  Order By: ${orderBy}`);
  console.log(`  Time Period: ${timePeriod}`);
  console.log(`  Batch Size: ${batchSize}`);
  console.log(`  Batch Delay: ${batchDelay}ms`);
  console.log(`  Skip Recently Synced: ${skipHours} hours`);
  console.log(`  Resume Mode: ${resume}`);
  console.log("");

  // Show current progress
  const progress = await getTradeHistorySyncProgress();
  console.log("Current Sync Status:");
  console.log(`  Pending: ${progress.pending}`);
  console.log(`  In Progress: ${progress.in_progress}`);
  console.log(`  Completed: ${progress.completed}`);
  console.log(`  Error: ${progress.error}`);
  console.log(`  Total: ${progress.total}`);
  console.log("");

  if (resume) {
    console.log("Resuming sync for pending/failed traders...");
    const result = await resumeTradeHistorySync({
      batchSize,
      batchDelay,
      skipRecentlysynced: 0, // Don't skip in resume mode
      onProgress: (p) => {
        if (p.status === "syncing_trader") {
          process.stdout.write(
            `\r[${p.currentTrader}/${p.totalTraders}] ${p.currentTraderAddress.slice(0, 10)}... (${p.tradesFetched} trades)`,
          );
        }
      },
    });

    console.log("\n");
    console.log("Resume Complete!");
    console.log(`  Processed: ${result.tradersProcessed}`);
    console.log(`  Skipped: ${result.tradersSkipped}`);
    console.log(`  Failed: ${result.tradersFailed}`);
    console.log(`  Total Trades: ${result.totalTradesSynced}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);
  } else {
    console.log(`Starting sync for top ${limit} traders...`);
    const result = await syncTopTradersTradeHistory({
      limit,
      orderBy,
      timePeriod,
      batchSize,
      batchDelay,
      skipRecentlysynced: skipHours,
      onProgress: (p) => {
        if (p.status === "fetching_leaderboard") {
          console.log("Fetching leaderboard...");
        } else if (p.status === "syncing_trader") {
          process.stdout.write(
            `\r[${p.currentTrader}/${p.totalTraders}] ${p.currentTraderAddress.slice(0, 10)}... (${p.tradesFetched} trades)`,
          );
        }
      },
    });

    console.log("\n");
    console.log("Sync Complete!");
    console.log(`  Processed: ${result.tradersProcessed}`);
    console.log(`  Skipped: ${result.tradersSkipped}`);
    console.log(`  Failed: ${result.tradersFailed}`);
    console.log(`  Total Trades: ${result.totalTradesSynced}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(1)}s`);

    if (result.errors.length > 0) {
      console.log("\nErrors:");
      for (const err of result.errors.slice(0, 10)) {
        console.log(`  ${err.traderId}: ${err.error}`);
      }
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more`);
      }
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
