/**
 * Records the daily bars used by the backtest demo mode.
 *
 *   bun scripts/record-backtest-fixtures.ts
 *
 * Writes src/backtest/fixtures/<SYMBOL>.json for each symbol below.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeBars } from "../src/backtest/bars";
import { yahooFinance } from "../src/stocks/yahoo-finance-wrapper";

const SYMBOLS = ["AAPL", "MSFT", "SPY"];
const START = "2022-01-01";
const END = "2024-12-31";
const OUT_DIR = join(import.meta.dir, "..", "src", "backtest", "fixtures");

const round = (n: number) => Math.round(n * 10_000) / 10_000;

for (const symbol of SYMBOLS) {
  const result = await yahooFinance.getHistorical(symbol, {
    period1: new Date(START),
    period2: new Date(`${END}T23:59:59Z`),
    interval: "1d",
  });
  if (!result.success || !result.data) throw new Error(`Yahoo returned no data for ${symbol}`);
  const rows = Array.isArray(result.data) ? result.data : (result.data as { quotes?: unknown[] }).quotes ?? [];
  const bars = normalizeBars(rows).filter((b) => b.date >= START && b.date <= END);
  const fixture = {
    symbol,
    source: "Yahoo Finance daily bars",
    recorded: new Date().toISOString().slice(0, 10),
    bars: bars.map((b) => [b.date, round(b.open), round(b.high), round(b.low), round(b.close), b.volume]),
  };
  writeFileSync(join(OUT_DIR, `${symbol}.json`), JSON.stringify(fixture) + "\n");
  console.log(`${symbol}: ${bars.length} bars, ${bars[0]?.date} to ${bars.at(-1)?.date}`);
}
