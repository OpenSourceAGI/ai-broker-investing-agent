import { describe, it, expect } from "vitest";
import { BACKTEST_CATALOG, describeCatalog, getStrategy } from "../../src/backtest/catalog";
import { runBacktests } from "../../src/backtest/run";
import { resolveParams } from "../../src/backtest/strategy";
import { loadFixtureBars } from "../../src/backtest/fixtures";
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

  it("no strategy looks ahead: actions on a shorter history equal the same prefix of the full run", () => {
    const stockBars = loadFixtureBars("AAPL", "2023-01-01", "2024-12-31")!;
    // YES prices in cents for prediction-market strategies.
    const eventBars = stockBars.map((b, i) => {
      const cents = Math.round(50 + 30 * Math.sin(i / 7) + 5 * Math.sin(i / 2));
      return { ...b, open: cents, high: cents, low: cents, close: cents };
    });
    const leaks: string[] = [];
    for (const strategy of BACKTEST_CATALOG) {
      const bars = strategy.assetClasses.includes("equity") ? stockBars : eventBars;
      const full = strategy.signals(bars, resolveParams(strategy));
      for (const end of [150, 260, 400]) {
        const prefix = strategy.signals(bars.slice(0, end), resolveParams(strategy));
        if (prefix.some((a, i) => a !== full[i])) leaks.push(`${strategy.id} @${end}`);
      }
    }
    expect(leaks).toEqual([]);
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
