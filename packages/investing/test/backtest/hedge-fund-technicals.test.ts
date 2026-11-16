import { describe, it, expect } from "vitest";
import {
  combineSignals,
  evaluateTechnicals,
  hedgeFundTechnicals,
} from "../../src/backtest/strategies/hedge-fund-technicals";
import { checkAvailability } from "../../src/backtest/strategy";
import type { Bar } from "../../src/backtest/types";

function linear(n: number, start: number, slope: number): Bar[] {
  return Array.from({ length: n }, (_, i) => {
    const close = start + slope * i;
    const day = new Date(Date.UTC(2023, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);
    return { date: day, open: close, high: close + 0.5, low: close - 0.5, close, volume: 1_000_000 };
  });
}

const neutral = { signal: "neutral" as const, confidence: 0.5 };

describe("combineSignals", () => {
  it("trend bullish 0.4 with the rest neutral 0.5 is bullish 0.2105", () => {
    const result = combineSignals({
      trend: { signal: "bullish", confidence: 0.4 },
      mean_reversion: neutral,
      momentum: neutral,
      volatility: neutral,
      stat_arb: neutral,
    });
    expect(result.signal).toBe("bullish");
    expect(result.confidence).toBeCloseTo(0.1 / 0.475, 4);
  });

  it("a higher threshold turns the same score neutral", () => {
    const parts = {
      trend: { signal: "bullish" as const, confidence: 0.4 },
      mean_reversion: neutral,
      momentum: neutral,
      volatility: neutral,
      stat_arb: neutral,
    };
    expect(combineSignals(parts, 0.3).signal).toBe("neutral");
  });

  it("all-zero confidence scores neutral", () => {
    const zero = { signal: "bullish" as const, confidence: 0 };
    expect(combineSignals({ trend: zero, mean_reversion: zero, momentum: zero, volatility: zero, stat_arb: zero }))
      .toEqual({ signal: "neutral", confidence: 0 });
  });
});

describe("evaluateTechnicals", () => {
  it("a steady uptrend ends bullish with a full-strength trend", () => {
    const result = evaluateTechnicals(linear(200, 50, 0.5));
    expect(result.parts.trend.signal).toBe("bullish");
    expect(result.parts.trend.confidence).toBeCloseTo(1, 6);
    expect(result.signal).toBe("bullish");
  });

  it("a steady downtrend ends bearish", () => {
    const result = evaluateTechnicals(linear(200, 200, -0.5));
    expect(result.parts.trend.signal).toBe("bearish");
    expect(result.signal).toBe("bearish");
  });
});

describe("hedgeFundTechnicals strategy", () => {
  it("is a third-party equity strategy credited to ai-hedge-fund", () => {
    expect(hedgeFundTechnicals).toMatchObject({
      id: "hedge-fund-technicals",
      provider: "third-party",
      assetClasses: ["equity"],
      minBars: 127,
      source: { repo: "ai-hedge-fund", file: "src/agents/technicals.py", license: "MIT" },
    });
  });

  it("holds for the first 126 bars, then buys an uptrend", () => {
    const bars = linear(200, 50, 0.5);
    const actions = hedgeFundTechnicals.signals(bars, { threshold: 0.2 });
    expect(actions).toHaveLength(200);
    expect(actions.slice(0, 126).every((a) => a === 0)).toBe(true);
    expect(actions[126]).toBe(1);
  });

  it("126 bars is insufficient history", () => {
    expect(checkAvailability(hedgeFundTechnicals, { assetClass: "equity", barCount: 126 })).toMatchObject({
      available: false,
      reason: "insufficient-history",
    });
  });
});
