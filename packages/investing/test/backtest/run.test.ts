import { describe, it, expect } from "vitest";
import { runBacktests } from "../../src/backtest/run";
import { checkAvailability, resolveParams, type BacktestStrategy } from "../../src/backtest/strategy";
import type { Action, Bar, CostModel } from "../../src/backtest/types";

const NO_COSTS: CostModel = { feeBps: 0, slippageBps: 0, positionSizePct: 100 };

const bars: Bar[] = [100, 105, 110, 120].map((close, i) => ({
  date: `2024-02-0${i + 1}`,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
}));

function fake(id: string, overrides: Partial<BacktestStrategy> = {}): BacktestStrategy {
  return {
    id,
    name: id.toUpperCase(),
    description: `${id} test strategy`,
    provider: "builtin",
    assetClasses: ["equity"],
    minBars: 2,
    params: [],
    signals: (b) => b.map((_, i) => (i === 0 ? 1 : 0) as Action),
    ...overrides,
  };
}

const catalog = [
  fake("good"),
  fake("broken", { signals: () => { throw new Error("indicator blew up"); } }),
  fake("events-only", {
    provider: "third-party",
    assetClasses: ["prediction-market"],
    unsupportedReason: "Trades binary event contracts only.",
  }),
  fake("long-lookback", { minBars: 50 }),
];

const base = { assetClass: "equity" as const, bars, initialCapital: 1000, costs: NO_COSTS };

describe("runBacktests", () => {
  it("one throwing strategy does not stop the others", () => {
    const results = runBacktests({ ...base, strategyIds: ["broken", "good"] }, catalog);
    expect(results.map((r) => [r.strategyId, r.status])).toEqual([
      ["good", "ok"],
      ["broken", "failed"],
    ]);
    const broken = results[1];
    expect(broken.status === "failed" && broken.error).toBe("indicator blew up");
  });

  it("unsupported asset is returned with its reason, not omitted", () => {
    const [result] = runBacktests({ ...base, strategyIds: ["events-only"] }, catalog);
    expect(result).toEqual({
      strategyId: "events-only",
      name: "EVENTS-ONLY",
      status: "unavailable",
      reason: "unsupported-asset",
      message: "Trades binary event contracts only.",
    });
  });

  it("insufficient history returns insufficient-history", () => {
    const [result] = runBacktests({ ...base, strategyIds: ["long-lookback"] }, catalog);
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "insufficient-history",
      message: "Needs at least 50 daily bars; the selected range has 4.",
    });
  });

  it("unknown id returns unknown-strategy and the others still run", () => {
    const results = runBacktests({ ...base, strategyIds: ["nope", "good"] }, catalog);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("ok");
    expect(results[1]).toMatchObject({ strategyId: "nope", status: "unavailable", reason: "unknown-strategy" });
  });

  it("'all' returns one entry per catalog strategy", () => {
    const results = runBacktests({ ...base, strategyIds: "all" }, catalog);
    expect(results.map((r) => r.strategyId).sort()).toEqual(catalog.map((s) => s.id).sort());
  });

  it("ok results carry metrics and the latest signal", () => {
    const [result] = runBacktests({ ...base, strategyIds: ["good"] }, catalog);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.metrics.finalValue).toBeCloseTo(1200, 6);
    expect(result.latestSignal).toEqual({ action: "BUY", date: "2024-02-01" });
  });

  it("passes resolved params to the strategy", () => {
    let seen: Record<string, number> = {};
    const tunable = fake("tunable", {
      params: [{ id: "threshold", label: "Threshold", default: 0.2, min: 0.05, max: 0.6 }],
      signals: (b, p) => { seen = p; return b.map(() => 0 as Action); },
    });
    runBacktests({ ...base, strategyIds: ["tunable"], params: { tunable: { threshold: 9 } } }, [tunable]);
    expect(seen).toEqual({ threshold: 0.6 });
  });
});

describe("checkAvailability", () => {
  it("is available for a supported asset with enough bars", () => {
    expect(checkAvailability(fake("good"), { assetClass: "equity", barCount: 10 })).toEqual({ available: true });
  });

  it("gives a default message when no unsupportedReason is set", () => {
    const result = checkAvailability(fake("x", { assetClasses: ["prediction-market"] }), { assetClass: "equity" });
    expect(result).toEqual({
      available: false,
      reason: "unsupported-asset",
      message: "Supports prediction-market assets only, not equity.",
    });
  });
});

describe("resolveParams", () => {
  it("uses defaults, clamps overrides and ignores unknown or non-numeric keys", () => {
    const strategy = fake("p", {
      params: [
        { id: "a", label: "A", default: 1, min: 0, max: 2 },
        { id: "b", label: "B", default: 5, min: 1, max: 10 },
      ],
    });
    expect(resolveParams(strategy, { a: -3, zzz: 4, b: Number.NaN })).toEqual({ a: 0, b: 5 });
  });
});
