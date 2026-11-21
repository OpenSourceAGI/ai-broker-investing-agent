import { describe, expect, it } from "vitest";
import {
  computeMarketRelativeSkill,
  type ResolvedForecast,
} from "../src/prediction/analysis/market-relative-skill";

/** Deterministic LCG so tests need no randomness. */
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

/** Market prices are calibrated; an informed forecaster sees the truth with noise. */
function simulate(n: number, informed: number, seed = 7): ResolvedForecast[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const q = 0.2 + 0.6 * r();
    const outcome = (r() < q ? 1 : 0) as 0 | 1;
    const signal = outcome === 1 ? 0.95 : 0.05;
    const p = (1 - informed) * q + informed * signal;
    return { probability: p, marketPrice: q, outcome };
  });
}

describe("computeMarketRelativeSkill", () => {
  it("returns an empty result for no forecasts", () => {
    const r = computeMarketRelativeSkill([]);
    expect(r.reason).toBe("empty");
    expect(r.skill).toBeNull();
    expect(r.skilled).toBe(false);
  });

  it("scores a single forecast by hand", () => {
    // p=0.9, q=0.5, YES: d = 0.25 - 0.01 = 0.24
    const r = computeMarketRelativeSkill([
      { probability: 0.9, marketPrice: 0.5, outcome: 1 },
    ]);
    expect(r.rawSkill).toBeCloseTo(0.24, 12);
    expect(r.forecasterBrier).toBeCloseTo(0.01, 12);
    expect(r.marketBrier).toBeCloseTo(0.25, 12);
    expect(r.effectiveSample).toBeCloseTo(1, 12);
    expect(r.reliable).toBe(false);
  });

  it("gives zero skill to someone who echoes the market", () => {
    const echo = simulate(200, 0).map((f) => ({ ...f, probability: f.marketPrice }));
    const r = computeMarketRelativeSkill(echo);
    expect(r.rawSkill).toBeCloseTo(0, 12);
    expect(r.skill).toBeCloseTo(0, 12);
    expect(r.skilled).toBe(false);
  });

  it("is negative for a forecaster worse than the market", () => {
    const bad = simulate(200, 0).map((f) => ({ ...f, probability: 1 - f.marketPrice }));
    const r = computeMarketRelativeSkill(bad);
    expect(r.skill!).toBeLessThan(0);
    expect(r.skilled).toBe(false);
  });

  it("flags an informed forecaster as skilled with enough history", () => {
    const r = computeMarketRelativeSkill(simulate(200, 0.5));
    expect(r.skill!).toBeGreaterThan(0);
    expect(r.lowerBound!).toBeGreaterThan(0);
    expect(r.reason).toBe("ok");
    expect(r.skilled).toBe(true);
  });

  it("does not trust a short lucky streak (shrinkage + reliability)", () => {
    const lucky: ResolvedForecast[] = Array.from({ length: 5 }, () => ({
      probability: 0.95, marketPrice: 0.5, outcome: 1 as const,
    }));
    lucky[2] = { ...lucky[2], probability: 0.9 };
    const r = computeMarketRelativeSkill(lucky);
    expect(r.rawSkill!).toBeGreaterThan(0.2);
    expect(r.skill!).toBeLessThan(r.rawSkill!);
    expect(r.reason).toBe("insufficient-sample");
    expect(r.skilled).toBe(false);
  });

  it("shrinks more with a stronger prior", () => {
    const f = simulate(100, 0.5);
    const weak = computeMarketRelativeSkill(f, { priorStrength: 1 }).skill!;
    const strong = computeMarketRelativeSkill(f, { priorStrength: 100 }).skill!;
    expect(Math.abs(strong)).toBeLessThan(Math.abs(weak));
  });

  it("decays old forecasts: a recent collapse hurts more with a short half-life", () => {
    const good = simulate(150, 0.6, 3);
    const recentBad = simulate(30, 0, 9).map((f) => ({
      ...f, probability: 1 - f.marketPrice,
    }));
    const hist = [...good, ...recentBad];
    const slow = computeMarketRelativeSkill(hist, { halfLifeForecasts: Infinity });
    const fast = computeMarketRelativeSkill(hist, { halfLifeForecasts: 10 });
    expect(fast.skill!).toBeLessThan(slow.skill!);
    expect(fast.effectiveSample).toBeLessThan(slow.effectiveSample);
  });

  it("effective sample equals count without decay and is smaller with decay", () => {
    const f = simulate(60, 0.3);
    expect(
      computeMarketRelativeSkill(f, { halfLifeForecasts: Infinity }).effectiveSample,
    ).toBeCloseTo(60, 9);
    expect(computeMarketRelativeSkill(f).effectiveSample).toBeLessThan(60);
  });

  it("reports zero-variance instead of an infinite bound", () => {
    const same: ResolvedForecast[] = Array.from({ length: 30 }, () => ({
      probability: 0.8, marketPrice: 0.6, outcome: 1 as const,
    }));
    const r = computeMarketRelativeSkill(same, { halfLifeForecasts: Infinity });
    expect(r.reason).toBe("zero-variance");
    expect(r.lowerBound).toBeNull();
    expect(r.skilled).toBe(false);
  });

  it("is deterministic and does not mutate its input", () => {
    const f = simulate(80, 0.4);
    const copy = JSON.stringify(f);
    expect(computeMarketRelativeSkill(f)).toEqual(computeMarketRelativeSkill(f));
    expect(JSON.stringify(f)).toBe(copy);
  });

  it("validates inputs", () => {
    const ok = { probability: 0.5, marketPrice: 0.5, outcome: 1 as const };
    expect(() => computeMarketRelativeSkill(null as never)).toThrow(TypeError);
    expect(() => computeMarketRelativeSkill([{ ...ok, probability: 1.2 }])).toThrow(RangeError);
    expect(() => computeMarketRelativeSkill([{ ...ok, marketPrice: NaN }])).toThrow(RangeError);
    expect(() => computeMarketRelativeSkill([{ ...ok, outcome: 2 as never }])).toThrow(TypeError);
    expect(() => computeMarketRelativeSkill([ok], { halfLifeForecasts: 0 })).toThrow(RangeError);
    expect(() => computeMarketRelativeSkill([ok], { priorStrength: -1 })).toThrow(RangeError);
  });
});
