import { checkAvailability, type Availability, type BacktestStrategy } from "./strategy";
import { indicatortsStrategies } from "./strategies/indicatorts";
import type { AssetClass } from "./types";

/** Every strategy the backtest engine can run, built-in and third-party. */
export const BACKTEST_CATALOG: BacktestStrategy[] = [...indicatortsStrategies];

export function getStrategy(id: string): BacktestStrategy | undefined {
  return BACKTEST_CATALOG.find((s) => s.id === id);
}

/** A catalog entry as the UI sees it: no signal function, plus availability. */
export type CatalogEntry = Omit<BacktestStrategy, "signals"> & { availability: Availability };

/** The whole catalog with each strategy's availability for `assetClass`. */
export function describeCatalog(assetClass: AssetClass, catalog: BacktestStrategy[] = BACKTEST_CATALOG): CatalogEntry[] {
  return catalog.map((strategy) => {
    const { signals: _signals, ...entry } = strategy;
    return { ...entry, availability: checkAvailability(strategy, { assetClass }) };
  });
}
