import { describe, it, expect } from "vitest";
import { simulate, validateCosts } from "../../src/backtest/simulate";
import { DEFAULT_COSTS, type Bar, type CostModel } from "../../src/backtest/types";

const NO_COSTS: CostModel = { feeBps: 0, slippageBps: 0, positionSizePct: 100 };

function barsFromCloses(closes: number[]): Bar[] {
  return closes.map((close, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }));
}

describe("simulate", () => {
  it("buy and hold with zero costs returns the close ratio", () => {
    const result = simulate(barsFromCloses([100, 110]), [1, 0], 1000, NO_COSTS);
    expect(result.finalValue).toBeCloseTo(1100, 6);
    expect(result.totalReturnPercent).toBeCloseTo(10, 6);
    expect(result.totalTrades).toBe(1);
    expect(result.winningTrades).toBe(1);
    expect(result.trades.map((t) => t.side)).toEqual(["BUY", "SELL"]);
  });

  it("fees and slippage reduce the result by exact amounts", () => {
    const costs: CostModel = { feeBps: 10, slippageBps: 10, positionSizePct: 100 };
    const result = simulate(barsFromCloses([100, 110]), [1, 0], 10000, costs);
    // Buy fill 100.1, 99 shares, fee 9.9099; sell fill 109.89, fee 10.87911.
    expect(result.trades[0]).toMatchObject({ side: "BUY", shares: 99 });
    expect(result.trades[0].price).toBeCloseTo(100.1, 9);
    expect(result.trades[0].fee).toBeCloseTo(9.9099, 6);
    expect(result.trades[1].price).toBeCloseTo(109.89, 9);
    expect(result.trades[1].fee).toBeCloseTo(10.87911, 6);
    expect(result.finalValue).toBeCloseTo(10948.42099, 4);
  });

  it("position size 50 % keeps half the cash", () => {
    const costs: CostModel = { ...NO_COSTS, positionSizePct: 50 };
    const result = simulate(barsFromCloses([100, 100]), [1, 0], 1000, costs);
    expect(result.trades[0].shares).toBe(5);
    expect(result.finalValue).toBeCloseTo(1000, 6);
  });

  it("capital below one share makes no trades", () => {
    const result = simulate(barsFromCloses([100, 120]), [1, 0], 50, NO_COSTS);
    expect(result.totalTrades).toBe(0);
    expect(result.trades).toHaveLength(0);
    expect(result.finalValue).toBe(50);
    expect(result.winRate).toBe(0);
  });

  it("sells on a -1 action and ignores a sell with no position", () => {
    const result = simulate(barsFromCloses([100, 90, 120, 130]), [-1, 1, -1, 0], 900, NO_COSTS);
    expect(result.trades.map((t) => [t.side, t.date])).toEqual([
      ["BUY", "2024-01-02"],
      ["SELL", "2024-01-03"],
    ]);
    expect(result.finalValue).toBeCloseTo(1200, 6);
  });

  it("max drawdown on 100,120,90,130 is 25", () => {
    const result = simulate(barsFromCloses([100, 120, 90, 130]), [1, 0, 0, 0], 100, NO_COSTS);
    expect(result.maxDrawdownPercent).toBeCloseTo(25, 6);
  });

  it("Sharpe counts entry costs: a run that only loses to fees has a negative Sharpe", () => {
    // Flat prices with a 1% fee: equity goes 10000 -> 9901 (entry) -> 9802 (exit).
    const costs: CostModel = { feeBps: 100, slippageBps: 0, positionSizePct: 100 };
    const result = simulate(barsFromCloses([100, 100]), [1, 0], 10000, costs);
    expect(result.totalReturn).toBeLessThan(0);
    expect(result.sharpeRatio).not.toBeNull();
    expect(result.sharpeRatio!).toBeLessThan(0);
  });

  it("Sharpe has the same sign as the return when entry costs dominate a small gain", () => {
    // Prices drift up 0.02% a day (about +0.58% in all), less than the 1% lost to
    // 50 bps of slippage on entry and exit, but more than the exit cost alone.
    const closes = Array.from({ length: 30 }, (_, i) => 100 * (1 + 0.0002 * i));
    const costs: CostModel = { feeBps: 0, slippageBps: 50, positionSizePct: 100 };
    const actions = closes.map((_, i) => (i === 0 ? 1 : 0)) as (0 | 1)[];
    const result = simulate(barsFromCloses(closes), actions, 100000, costs);
    expect(result.totalReturn).toBeLessThan(0);
    expect(result.sharpeRatio!).toBeLessThan(0);
  });

  it("mismatched lengths throw", () => {
    expect(() => simulate(barsFromCloses([100, 110]), [1], 1000, NO_COSTS)).toThrow(/length/);
  });

  it("non-positive capital throws", () => {
    expect(() => simulate(barsFromCloses([100]), [0], 0, NO_COSTS)).toThrow(/capital/);
  });
});

describe("validateCosts", () => {
  it("fills defaults for missing fields", () => {
    expect(validateCosts({})).toEqual({ costs: DEFAULT_COSTS });
  });

  it("rejects a fee above 500 bps", () => {
    expect(validateCosts({ feeBps: 600 })).toEqual({ error: expect.stringMatching(/feeBps/) });
  });

  it("rejects a position size of 0", () => {
    expect(validateCosts({ positionSizePct: 0 })).toEqual({
      error: expect.stringMatching(/positionSizePct/),
    });
  });

  it("rejects non-numeric values", () => {
    expect(validateCosts({ slippageBps: "5" as unknown as number })).toEqual({
      error: expect.stringMatching(/slippageBps/),
    });
  });
});
