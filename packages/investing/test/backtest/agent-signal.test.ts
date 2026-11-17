import { describe, it, expect } from "vitest";
import { toAgentTradeSignal } from "../../src/backtest/agent-signal";
import { runBacktests } from "../../src/backtest/run";
import { loadFixtureBars } from "../../src/backtest/fixtures";
import { DEFAULT_COSTS, type BacktestMetrics } from "../../src/backtest/types";
import type { TradeSignal } from "../../src/trading-agents/types";

const metrics = (over: Partial<BacktestMetrics> = {}): BacktestMetrics => ({
  finalValue: 112_500,
  totalReturn: 12_500,
  totalReturnPercent: 12.5,
  totalTrades: 5,
  winningTrades: 3,
  losingTrades: 2,
  winRate: 60,
  maxDrawdownPercent: 8.25,
  sharpeRatio: 0.9,
  trades: [],
  ...over,
});

describe("toAgentTradeSignal", () => {
  it("maps a backtest result to the trading agents' TradeSignal", () => {
    const signal: TradeSignal = toAgentTradeSignal(
      {
        strategyId: "macd",
        name: "MACD Strategy",
        status: "ok",
        metrics: metrics(),
        latestSignal: { action: "BUY", date: "2024-12-19" },
      },
      "2024-12-31",
    );
    expect(signal.action).toBe("BUY");
    expect(signal.confidence).toBeCloseTo(0.6, 9); // 3 of 5 round trips won
    expect(signal.timestamp.toISOString()).toBe("2024-12-19T00:00:00.000Z");
    expect(signal.reasoning).toBe(
      "MACD Strategy backtest: latest signal BUY on 2024-12-19; +12.50% over 5 round trips, 60.0% won, max drawdown 8.25%.",
    );
  });

  it("has zero confidence and the backtest end date when the strategy never traded", () => {
    const signal = toAgentTradeSignal(
      {
        strategyId: "nvi",
        name: "Negative Volume Index (NVI)",
        status: "ok",
        metrics: metrics({ totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, totalReturn: 0, totalReturnPercent: 0 }),
        latestSignal: { action: "HOLD", date: null },
      },
      "2024-12-31",
    );
    expect(signal).toMatchObject({ action: "HOLD", confidence: 0 });
    expect(signal.timestamp.toISOString()).toBe("2024-12-31T00:00:00.000Z");
    expect(signal.reasoning).toContain("no signal in the backtest window");
  });

  it("turns a real backtest of the ported hedge-fund bot into a valid agent signal", () => {
    const bars = loadFixtureBars("AAPL", "2022-01-01", "2024-12-31")!;
    const [result] = runBacktests({
      assetClass: "equity",
      bars,
      initialCapital: 100_000,
      costs: DEFAULT_COSTS,
      strategyIds: ["hedge-fund-technicals"],
    });
    if (result.status !== "ok") throw new Error(`unexpected ${result.status}`);
    const signal = toAgentTradeSignal(result, bars.at(-1)!.date);
    expect(["BUY", "SELL", "HOLD"]).toContain(signal.action);
    expect(signal.confidence).toBeGreaterThanOrEqual(0);
    expect(signal.confidence).toBeLessThanOrEqual(1);
    expect(Number.isNaN(signal.timestamp.getTime())).toBe(false);
    expect(signal.reasoning).toMatch(/^Hedge-fund technicals backtest:/);
  });
});
