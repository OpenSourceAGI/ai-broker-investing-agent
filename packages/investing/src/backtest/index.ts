export * from "./types";
export { simulate, validateCosts } from "./simulate";
export { checkAvailability, resolveParams } from "./strategy";
export type { Availability, BacktestStrategy, StrategyParam, UnavailableReason } from "./strategy";
export { BACKTEST_CATALOG, describeCatalog, getStrategy } from "./catalog";
export type { CatalogEntry } from "./catalog";
export { runBacktests } from "./run";
export { toAgentTradeSignal } from "./agent-signal";
export type { BacktestRequest, LatestSignal, StrategyRunResult } from "./run";
