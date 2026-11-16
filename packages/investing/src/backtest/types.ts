/**
 * Shared types for per-symbol backtesting.
 *
 * Every strategy, built-in or ported from `third-party-trading-bots/`, is
 * simulated by the same engine with the same cost model, so results are
 * comparable side by side.
 */

/** One daily OHLCV bar. `date` is an ISO calendar date (YYYY-MM-DD). */
export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Per-bar decision: 1 = buy (enter long), -1 = sell (exit), 0 = hold. */
export type Action = -1 | 0 | 1;

/** What kind of instrument the bars describe. */
export type AssetClass = "equity" | "prediction-market";

/** Trading costs and sizing applied identically to every strategy. */
export interface CostModel {
  /** Commission per fill, in basis points of the fill's notional. */
  feeBps: number;
  /** Price impact per fill, in basis points against the trader. */
  slippageBps: number;
  /** Share of available cash committed on each entry, 1–100. */
  positionSizePct: number;
}

export const DEFAULT_COSTS: CostModel = {
  feeBps: 5,
  slippageBps: 5,
  positionSizePct: 100,
};

/** Inclusive bounds accepted by `validateCosts`. */
export const COST_LIMITS: Record<keyof CostModel, { min: number; max: number }> = {
  feeBps: { min: 0, max: 500 },
  slippageBps: { min: 0, max: 500 },
  positionSizePct: { min: 1, max: 100 },
};

/** One simulated fill. `price` already includes slippage. */
export interface Trade {
  side: "BUY" | "SELL";
  date: string;
  price: number;
  shares: number;
  fee: number;
}

export interface BacktestMetrics {
  finalValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  /** Completed round trips (an open position is closed on the last bar). */
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  /** Winning round trips as a percentage of all round trips. */
  winRate: number;
  /** Largest peak-to-trough fall of the equity curve, in percent. */
  maxDrawdownPercent: number;
  /** Annualized Sharpe ratio of daily equity returns; null when undefined. */
  sharpeRatio: number | null;
  trades: Trade[];
}
