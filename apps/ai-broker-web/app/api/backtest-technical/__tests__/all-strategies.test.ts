import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/packages/investing/src/stocks/yahoo-finance-wrapper", () => ({
  yahooFinance: {
    getHistorical: vi.fn(),
  },
}));

import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";
import { BACKTESTABLE_STRATEGIES } from "@/lib/technical-strategies";
import { POST } from "../route";

const mockGetHistorical = yahooFinance.getHistorical as unknown as ReturnType<
  typeof vi.fn
>;

/** ~3 years of deterministic daily bars: an uptrend with waves and noise. */
function syntheticBars(count = 750) {
  const bars = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const start = Date.UTC(2022, 0, 3);
  for (let i = 0; i < count; i++) {
    const base = 100 + i * 0.05 + 12 * Math.sin(i / 15) + 6 * Math.sin(i / 4);
    const close = base + (rand() - 0.5) * 4;
    const open = close + (rand() - 0.5) * 2;
    bars.push({
      date: new Date(start + i * 86_400_000).toISOString(),
      open,
      high: Math.max(open, close) + rand() * 2,
      low: Math.min(open, close) - rand() * 2,
      close,
      volume: 1_000_000 + Math.floor(rand() * 500_000),
    });
  }
  // A missing session from the data provider must not break the run.
  bars.splice(100, 0, { ...bars[100], close: null as unknown as number });
  return bars;
}

const request = (strategyIds: string[]) =>
  new Request("http://localhost/api/backtest-technical", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      symbol: "AAPL",
      startDate: "2022-01-01",
      endDate: "2024-12-01",
      initialCapital: 100000,
      strategyIds,
    }),
  });

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockGetHistorical.mockResolvedValue({ success: true, data: syntheticBars() });
});

describe("POST /api/backtest-technical with the real strategy library", () => {
  it("returns a result with a trust score for every strategy in the Algo Strategies tab", async () => {
    const ids = BACKTESTABLE_STRATEGIES.map(({ id }) => id);
    const response = await POST(request(ids) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(
      body.results.map((r: { strategyId: string }) => r.strategyId).sort(),
    ).toEqual([...ids].sort());

    for (const result of body.results) {
      expect(Number.isFinite(result.finalValue)).toBe(true);
      expect(Number.isFinite(result.totalReturnPercent)).toBe(true);
      expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(typeof result.trustReliable).toBe("boolean");
      expect(typeof result.trustReason).toBe("string");
      expect(
        result.trustScore === null || Number.isFinite(result.trustScore),
      ).toBe(true);
      if (result.totalTrades >= 25 && result.trustScore !== null) {
        expect(result.trustReliable).toBe(true);
      }
    }
  });

  it("backtests the ported EMA crossover and BB + RSI breakout strategies", async () => {
    const response = await POST(
      request(["ema-crossover", "bb-rsi-breakout"]) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(2);
    for (const result of body.results) {
      expect(result.totalTrades).toBeGreaterThan(0);
      // Long-only: signals alternate BUY, SELL, BUY, SELL...
      result.signals.forEach((signal: { action: string }, i: number) => {
        expect(signal.action).toBe(i % 2 === 0 ? "BUY" : "SELL");
      });
    }
  });

  it("gives Buy Hold the same Sharpe sign as its return", async () => {
    const response = await POST(request(["buy-hold"]) as never);
    const [result] = (await response.json()).results;

    expect(result.totalReturnPercent).toBeGreaterThan(0);
    expect(result.sharpeRatio).toBeGreaterThan(0);
  });
});
