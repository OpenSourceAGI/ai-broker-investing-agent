/**
 * @fileoverview Binary-option Greeks for prediction markets. The database is
 * mocked; the maths runs for real, so the numeric expectations are derived
 * from the same closed forms the module documents.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../src/db/client", () => ({ getPool: () => ({ query }) }));
vi.mock("../src/utils/logger", () => {
  const noop = () => {};
  return { createChildLogger: () => ({ info: noop, debug: noop, warn: noop, error: noop }) };
});

import { calculateGreeks, greeksEnricher } from "../src/prediction/analysis/greeks";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-01-01T00:00:00Z");
const PHI0 = 1 / Math.sqrt(2 * Math.PI); // standard normal pdf at 0

/** Make the volatility query report a daily vol and sample size. */
const volatility = (dailyVol: number, sampleCount: number) =>
  query.mockResolvedValue({ rows: [{ daily_vol: dailyVol, sample_count: sampleCount }] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  query.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateGreeks — time to expiry", () => {
  it("counts days until the end date", async () => {
    volatility(0.02, 10);
    const g = await calculateGreeks(0.5, "tok", new Date(NOW.getTime() + 30 * DAY));
    expect(g.daysToExpiry).toBeCloseTo(30, 6);
  });

  it("assumes a year when the market has no end date", async () => {
    volatility(0.02, 10);
    const g = await calculateGreeks(0.5, "tok", null);
    expect(g.daysToExpiry).toBe(365);
  });

  it("clamps an already-expired market to 0 days with zero theta and vega", async () => {
    volatility(0.02, 10);
    const g = await calculateGreeks(0.5, "tok", new Date(NOW.getTime() - 5 * DAY));
    expect(g.daysToExpiry).toBe(0);
    expect(g.theta).toBe(0);
    expect(g.vega).toBe(0);
  });
});

describe("calculateGreeks — volatility", () => {
  it("annualises the daily volatility by √365", async () => {
    volatility(0.02, 10);
    const g = await calculateGreeks(0.5, "tok", null);
    expect(g.impliedVol).toBeCloseTo(0.02 * Math.sqrt(365), 10);
  });

  it("queries the last 7 days of snapshots for the given token", async () => {
    volatility(0.02, 10);
    await calculateGreeks(0.5, "token-123", null);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("price_snapshots");
    expect(sql).toContain("7 days");
    expect(params).toEqual(["token-123"]);
  });

  it("falls back to 50% when there are fewer than 3 daily returns", async () => {
    volatility(0.5, 2);
    expect((await calculateGreeks(0.5, "tok", null)).impliedVol).toBe(0.5);
  });

  it("clamps to the 10%..300% annual band", async () => {
    volatility(0.0001, 10);
    expect((await calculateGreeks(0.5, "tok", null)).impliedVol).toBe(0.1);
    volatility(5, 10);
    expect((await calculateGreeks(0.5, "tok", null)).impliedVol).toBe(3);
  });

  it("falls back to 50% on a database error or an empty result", async () => {
    query.mockRejectedValue(new Error("db down"));
    expect((await calculateGreeks(0.5, "tok", null)).impliedVol).toBe(0.5);
    query.mockResolvedValue({ rows: [] });
    expect((await calculateGreeks(0.5, "tok", null)).impliedVol).toBe(0.5);
  });

  it("accepts numeric strings from the driver", async () => {
    query.mockResolvedValue({ rows: [{ daily_vol: "0.03", sample_count: "7" }] });
    expect((await calculateGreeks(0.5, "tok", null)).impliedVol).toBeCloseTo(0.03 * Math.sqrt(365), 10);
  });
});

describe("calculateGreeks — Greek values", () => {
  it("at p=0.5 theta and vega follow the closed forms (normal pdf at 0)", async () => {
    volatility(0.02, 10);
    const T = 90 / 365;
    const vol = 0.02 * Math.sqrt(365);
    const g = await calculateGreeks(0.5, "tok", new Date(NOW.getTime() + 90 * DAY));
    expect(g.theta).toBeCloseTo(((-vol * PHI0) / (2 * Math.sqrt(T)) * 100) / 365, 8);
    expect(g.vega).toBeCloseTo(PHI0 * Math.sqrt(T), 8);
  });

  it("theta is negative (time decay) and vega positive for live markets", async () => {
    volatility(0.02, 10);
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const g = await calculateGreeks(p, "tok", new Date(NOW.getTime() + 60 * DAY));
      expect(g.theta).toBeLessThan(0);
      expect(g.vega).toBeGreaterThan(0);
    }
  });

  it("is symmetric about 50%: p and 1-p share theta and vega", async () => {
    volatility(0.02, 10);
    const end = new Date(NOW.getTime() + 60 * DAY);
    const a = await calculateGreeks(0.2, "tok", end);
    const b = await calculateGreeks(0.8, "tok", end);
    expect(a.theta).toBeCloseTo(b.theta, 6);
    expect(a.vega).toBeCloseTo(b.vega, 6);
  });

  it("decay and vega shrink toward the extremes (near-certain markets move less)", async () => {
    volatility(0.02, 10);
    const end = new Date(NOW.getTime() + 60 * DAY);
    const mid = await calculateGreeks(0.5, "tok", end);
    const tail = await calculateGreeks(0.95, "tok", end);
    expect(Math.abs(tail.theta)).toBeLessThan(Math.abs(mid.theta));
    expect(tail.vega).toBeLessThan(mid.vega);
  });

  it("uncertainty is p(1-p), peaking at 0.25", async () => {
    volatility(0.02, 10);
    expect((await calculateGreeks(0.5, "t", null)).uncertainty).toBe(0.25);
    expect((await calculateGreeks(0.2, "t", null)).uncertainty).toBeCloseTo(0.16, 12);
    expect((await calculateGreeks(0, "t", null)).uncertainty).toBe(0);
    expect((await calculateGreeks(1, "t", null)).uncertainty).toBe(0);
  });

  it("stays finite at the 0 and 1 boundaries (the inverse CDF is clamped)", async () => {
    volatility(0.02, 10);
    const end = new Date(NOW.getTime() + 30 * DAY);
    for (const p of [0, 1, 0.0001, 0.9999, 0.01, 0.99]) {
      const g = await calculateGreeks(p, "tok", end);
      expect(Number.isFinite(g.theta)).toBe(true);
      expect(Number.isFinite(g.vega)).toBe(true);
    }
  });

  it("covers the lower-tail, central and upper-tail inverse-CDF branches", async () => {
    volatility(0.02, 10);
    const end = new Date(NOW.getTime() + 30 * DAY);
    const lower = await calculateGreeks(0.01, "tok", end); // < 0.02425
    const central = await calculateGreeks(0.4, "tok", end);
    const upper = await calculateGreeks(0.99, "tok", end); // > 1 - 0.02425
    // The tails are mirror images.
    expect(lower.vega).toBeCloseTo(upper.vega, 6);
    expect(central.vega).toBeGreaterThan(lower.vega);
  });
});

describe("greeksEnricher", () => {
  const signal = (over: Record<string, unknown> = {}) =>
    ({
      movement: {
        marketId: "m1",
        tokenId: "tok",
        priceAfter: 0.5,
        market: { endDate: new Date(NOW.getTime() + 30 * DAY) },
        ...over,
      },
      enrichments: { avgTraderScore: 7 },
    }) as any;

  it("is named 'greeks'", () => {
    expect(greeksEnricher.name).toBe("greeks");
  });

  it("adds greeks to the enrichments without dropping existing ones", async () => {
    volatility(0.02, 10);
    const enriched = await greeksEnricher.enrich(signal());
    expect(enriched.enrichments.avgTraderScore).toBe(7);
    expect(enriched.enrichments.greeks).toMatchObject({ daysToExpiry: expect.any(Number), uncertainty: 0.25 });
  });

  it("returns the original signal when the calculation throws", async () => {
    const s = signal({ market: undefined });
    const out = await greeksEnricher.enrich(s);
    expect(out).toBe(s);
  });
});
