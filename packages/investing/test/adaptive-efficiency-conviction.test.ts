import { describe, expect, it } from "vitest";
import {
  computeAevciSeries,
  evaluateAevciStrategy,
  normalizeAevciConfig,
  type AevciBar,
} from "../src/stocks/strategies/adaptive-efficiency-conviction";

function makeBars(closes: number[], spread = 1): AevciBar[] {
  return closes.map((close, i) => ({
    date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10),
    close,
    high: close + spread,
    low: close - spread,
  }));
}

describe("Adaptive Efficiency & Volatility-Normalized Conviction Index (AEVCI)", () => {
  it("handles empty inputs and enforces warmup bars", () => {
    expect(computeAevciSeries([])).toEqual([]);
    expect(evaluateAevciStrategy([])).toEqual([]);

    const shortBars = makeBars(Array.from({ length: 15 }, (_, i) => 100 + i));
    const signals = evaluateAevciStrategy(shortBars);
    expect(signals).toHaveLength(15);
    expect(signals.every((s) => s.action === "HOLD")).toBe(true);
  });

  it("is strictly causal (zero look-ahead)", () => {
    const baseCloses = Array.from({ length: 60 }, (_, i) => 100 + i * 0.8 + Math.sin(i / 4) * 2);
    const prefixBars = makeBars(baseCloses.slice(0, 40));
    const extendedBars = makeBars([...baseCloses.slice(0, 40), ...baseCloses.slice(40).map((c) => c * 0.5)]);

    const prefixSignals = evaluateAevciStrategy(prefixBars);
    const extendedSignals = evaluateAevciStrategy(extendedBars);

    expect(extendedSignals.slice(0, 40)).toEqual(prefixSignals);
  });

  it("stays flat during noisy chop and enters during clean directional uptrends", () => {
    // Choppy sideways bars: alternating +1 / -1
    const choppyCloses = Array.from({ length: 50 }, (_, i) => 100 + (i % 2 === 0 ? 1.5 : -1.5));
    const choppySignals = evaluateAevciStrategy(makeBars(choppyCloses));
    expect(choppySignals.some((s) => s.action === "BUY")).toBe(false);

    // Flat base followed by strong steady uptrend
    const trendCloses = [
      ...Array.from({ length: 22 }, () => 100),
      ...Array.from({ length: 30 }, (_, i) => 100 + (i + 1) * 1.8),
    ];
    const trendSignals = evaluateAevciStrategy(makeBars(trendCloses, 0.8));
    expect(trendSignals.some((s) => s.action === "BUY")).toBe(true);
  });

  it("exits on sharp reversal via trailing ATR stop or momentum reversal", () => {
    const boomAndBust = [
      ...Array.from({ length: 22 }, () => 100),
      ...Array.from({ length: 25 }, (_, i) => 100 + (i + 1) * 2),
      ...Array.from({ length: 20 }, (_, i) => 150 - (i + 1) * 4),
    ];
    const signals = evaluateAevciStrategy(makeBars(boomAndBust, 1));
    const buyIndex = signals.findIndex((s) => s.action === "BUY");
    const sellIndex = signals.findIndex((s) => s.action === "SELL");

    expect(buyIndex).toBeGreaterThan(-1);
    expect(sellIndex).toBeGreaterThan(buyIndex);
  });

  it("rejects non-finite bar prices and normalizes invalid config safely", () => {
    const cfg = normalizeAevciConfig({ period: -5, fastAlpha: 2, minEfficiency: -1 });
    expect(cfg.period).toBe(14);
    expect(cfg.fastAlpha).toBe(0.45);
    expect(cfg.minEfficiency).toBe(0.3);

    expect(() =>
      computeAevciSeries([{ date: "2024-01-01", close: Number.NaN, high: 10, low: 9 }]),
    ).toThrow("Invalid bar price at index 0");
  });
});
