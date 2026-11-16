/**
 * Recorded daily bars for the offline demo mode. Static JSON imports keep
 * them bundled for Cloudflare Workers, which have no filesystem at request
 * time. Re-record with `bun scripts/record-backtest-fixtures.ts`.
 */
import aapl from "./AAPL.json";
import msft from "./MSFT.json";
import spy from "./SPY.json";
import type { Bar } from "../types";

/** [date, open, high, low, close, volume] */
type Row = [string, number, number, number, number, number];

interface Fixture {
  symbol: string;
  source: string;
  recorded: string;
  bars: Row[];
}

const FIXTURES: Record<string, Fixture> = Object.fromEntries(
  [aapl, msft, spy].map((f) => [f.symbol, f as Fixture]),
);

export const FIXTURE_SYMBOLS = Object.keys(FIXTURES).sort();

/** Fixture bars for `symbol` within [startDate, endDate], or null if not recorded. */
export function loadFixtureBars(symbol: string, startDate: string, endDate: string): Bar[] | null {
  const fixture = FIXTURES[symbol.toUpperCase()];
  if (!fixture) return null;
  return fixture.bars
    .filter(([date]) => date >= startDate && date <= endDate)
    .map(([date, open, high, low, close, volume]) => ({ date, open, high, low, close, volume }));
}
