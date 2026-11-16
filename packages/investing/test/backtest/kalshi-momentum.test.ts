import { describe, it, expect } from "vitest";
import { kalshiMomentum } from "../../src/backtest/strategies/kalshi-momentum";
import { BACKTEST_CATALOG } from "../../src/backtest/catalog";
import { runBacktests } from "../../src/backtest/run";
import { checkAvailability } from "../../src/backtest/strategy";
import { DEFAULT_COSTS, type Bar } from "../../src/backtest/types";

function yesPrices(cents: number[]): Bar[] {
  return cents.map((c, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, "0")}`,
    open: c,
    high: c,
    low: c,
    close: c,
    volume: 0,
  }));
}

describe("kalshiMomentum strategy", () => {
  it("is unsupported for equities with its reason", () => {
    const availability = checkAvailability(kalshiMomentum, { assetClass: "equity" });
    expect(availability).toEqual({
      available: false,
      reason: "unsupported-asset",
      message: expect.stringMatching(/binary event contracts/),
    });
  });

  it("buys after 3 consecutive YES increases and exits at the profit target", () => {
    const actions = kalshiMomentum.signals(yesPrices([40, 41, 42, 43, 45, 49, 49]), {});
    // Entry at 43c (index 3); 49c is +6c, past the 5c profit target (index 5).
    expect(actions).toEqual([0, 0, 0, 1, 0, -1, 0]);
  });

  it("does not trade the NO side", () => {
    const actions = kalshiMomentum.signals(yesPrices([60, 59, 58, 57, 56]), {});
    expect(actions.every((a) => a === 0)).toBe(true);
  });

  it("is registered in the catalog and never runs on a stock", () => {
    expect(BACKTEST_CATALOG.map((s) => s.id)).toEqual(expect.arrayContaining(["kalshi-momentum", "hedge-fund-technicals"]));
    const [result] = runBacktests({
      assetClass: "equity",
      bars: yesPrices([40, 41, 42, 43]),
      initialCapital: 1000,
      costs: DEFAULT_COSTS,
      strategyIds: ["kalshi-momentum"],
    });
    expect(result).toMatchObject({ status: "unavailable", reason: "unsupported-asset" });
  });
});
