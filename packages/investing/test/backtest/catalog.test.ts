import { describe, it, expect } from "vitest";
import { BACKTEST_CATALOG, describeCatalog, getStrategy } from "../../src/backtest/catalog";
import { runBacktests } from "../../src/backtest/run";
import { DEFAULT_COSTS, type Bar } from "../../src/backtest/types";

function wave(n: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 100 + 10 * Math.sin(i / 6) + i * 0.05;
    const day = new Date(Date.UTC(2023, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);
    return { date: day, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000_000 + (i % 7) * 10_000 };
  });
}

describe("backtest catalog", () => {
  it("catalog ids are unique and include buy-hold and macd", () => {
    const ids = BACKTEST_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["buy-hold", "macd"]));
  });

  it("exposes every indicatorts strategy the stock page used to offer", () => {
    const builtins = BACKTEST_CATALOG.filter((s) => s.provider === "builtin");
    expect(builtins).toHaveLength(24);
    expect(getStrategy("rsi-2")?.name).toBe("RSI 2");
  });

  it("describeCatalog omits signal functions and reports availability", () => {
    const entries = describeCatalog("equity");
    expect(entries).toHaveLength(BACKTEST_CATALOG.length);
    const buyHold = entries.find((e) => e.id === "buy-hold");
    expect(buyHold).toMatchObject({ availability: { available: true } });
    expect(buyHold && "signals" in buyHold).toBe(false);
  });

  it("every built-in strategy runs on a year of synthetic bars", () => {
    const results = runBacktests({
      assetClass: "equity",
      bars: wave(260),
      initialCapital: 10_000,
      costs: DEFAULT_COSTS,
      strategyIds: BACKTEST_CATALOG.filter((s) => s.provider === "builtin").map((s) => s.id),
    });
    const notOk = results.filter((r) => r.status !== "ok");
    expect(notOk).toEqual([]);
  });
});
