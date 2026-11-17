import type { TradeSignal } from "../trading-agents/types";
import type { StrategyRunResult } from "./run";

type OkResult = Extract<StrategyRunResult, { status: "ok" }>;

/**
 * Express a backtest result as the trading agents' `TradeSignal`, so the
 * agent pipeline can consume a strategy's latest call next to its own.
 *
 * - `action`: the strategy's most recent BUY/SELL, or HOLD if it never signalled.
 * - `confidence`: the share of the strategy's round trips that made money on
 *   this symbol and window (0 when it never traded). A measured hit rate, not
 *   a forecast.
 * - `timestamp`: the day of that latest signal, or `asOf` (the last bar of the
 *   backtest) when there was none.
 */
export function toAgentTradeSignal(result: OkResult, asOf: string): TradeSignal {
  const { metrics, latestSignal, name } = result;
  const confidence = metrics.totalTrades > 0 ? metrics.winningTrades / metrics.totalTrades : 0;
  const when = latestSignal.date
    ? `latest signal ${latestSignal.action} on ${latestSignal.date}`
    : "no signal in the backtest window";
  const sign = metrics.totalReturnPercent >= 0 ? "+" : "";
  return {
    action: latestSignal.action,
    confidence,
    reasoning:
      `${name} backtest: ${when}; ${sign}${metrics.totalReturnPercent.toFixed(2)}% over ` +
      `${metrics.totalTrades} round trips, ${metrics.winRate.toFixed(1)}% won, ` +
      `max drawdown ${metrics.maxDrawdownPercent.toFixed(2)}%.`,
    timestamp: new Date(`${latestSignal.date ?? asOf}T00:00:00Z`),
  };
}
