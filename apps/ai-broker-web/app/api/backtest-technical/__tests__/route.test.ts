import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStrategies } = vi.hoisted(() => {
  const strategy = (name: string, actions: number[]) => ({
    name,
    strategy: vi.fn(() => actions),
  });

  return {
    mockStrategies: [
      strategy("Buy Hold", [1, 0, -1]),
      strategy("MACD Strategy", [0, 1, -1]),
      strategy("Bollinger Bands", [1, -1, 0]),
    ],
  };
});

vi.mock("indicatorts", () => ({
  STRATEGY_INFOS: mockStrategies,
  backtest: vi.fn((_asset, strategies) =>
    strategies.map((info: unknown) => ({ info })),
  ),
}));

vi.mock("@/packages/investing/src/stocks/yahoo-finance-wrapper", () => ({
  yahooFinance: {
    getHistorical: vi.fn(),
  },
}));

import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";
import { POST } from "../route";
import reference from "@/packages/investing/test/strategy-signals/golden/hedge-fund-technicals-reference.json";

const mockGetHistorical = yahooFinance.getHistorical as unknown as ReturnType<
  typeof vi.fn
>;

const prices = [
  { date: "2024-01-02", open: 10, high: 11, low: 9, close: 10, volume: 100 },
  { date: "2024-01-03", open: 11, high: 12, low: 10, close: 11, volume: 110 },
  { date: "2024-01-04", open: 12, high: 13, low: 11, close: 12, volume: 120 },
];

const request = (strategyIds: string[]) =>
  new Request("http://localhost/api/backtest-technical", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      symbol: "AAPL",
      startDate: "2024-01-01",
      endDate: "2024-01-05",
      strategyIds,
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockGetHistorical.mockResolvedValue({ success: true, data: prices });
});

describe("POST /api/backtest-technical strategy selection", () => {
  it("maps selected short IDs to exact library strategy names", async () => {
    const response = await POST(request(["macd", "bollinger-bands"]) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockStrategies[0].strategy).not.toHaveBeenCalled();
    expect(mockStrategies[1].strategy).toHaveBeenCalledTimes(1);
    expect(mockStrategies[2].strategy).toHaveBeenCalledTimes(1);
    expect(
      body.results
        .map((result: { strategyId: string }) => result.strategyId)
        .sort(),
    ).toEqual(["bollinger-bands", "macd"]);
  });

  it("reports unknown catalog IDs as skipped without changing selection behavior", async () => {
    const response = await POST(request(["tradingview-id", "macd"]) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockStrategies[1].strategy).toHaveBeenCalledTimes(1);
    expect(mockStrategies[2].strategy).not.toHaveBeenCalled();
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      strategyId: "macd",
      strategyName: "MACD Strategy",
    });
    expect(body.skipped).toEqual([
      { strategyId: "tradingview-id", reason: expect.stringContaining("TradingView") },
    ]);
  });

  it("omits skipped when every selected strategy ran", async () => {
    const body = await (await POST(request(["macd"]) as never)).json();
    expect(body).not.toHaveProperty("skipped");
  });

  it("marks prediction-market sources as replay-demo only", async () => {
    const body = await (await POST(request(["kalshi-vibe"]) as never)).json();
    expect(body.results).toEqual([]);
    expect(body.skipped).toEqual([
      { strategyId: "kalshi-vibe", reason: expect.stringContaining("replay demo only") },
    ]);
  });

  it("replays hedge-fund technicals walk-forward over the fetched daily bars", async () => {
    const up = reference.cases.find((c) => c.name === "up")!.bars;
    mockGetHistorical.mockResolvedValue({ success: true, data: up });
    const body = await (await POST(request(["hedge-fund-technicals"]) as never)).json();

    expect(body.skipped).toBeUndefined();
    expect(body.results).toHaveLength(1);
    const [result] = body.results;
    expect(result).toMatchObject({
      strategyId: "hedge-fund-technicals",
      strategyName: "Hedge-fund technicals (ai-hedge-fund)",
      totalTrades: 1,
    });
    // No trade before the 127-bar warmup; the uptrend's first decision is a BUY.
    expect(result.signals[0].action).toBe("BUY");
    expect(Date.parse(result.signals[0].date)).toBeGreaterThanOrEqual(Date.parse(up[126].date));
  });

  it("holds through warmup on a short history", async () => {
    const body = await (await POST(request(["hedge-fund-technicals"]) as never)).json();
    expect(body.results[0]).toMatchObject({ totalTrades: 0, totalReturn: 0 });
  });

  it("skips a replay whose bars are invalid instead of failing the request", async () => {
    mockGetHistorical.mockResolvedValue({
      success: true,
      data: prices.map((p, i) => (i === 1 ? { ...p, volume: null } : p)),
    });
    const response = await POST(request(["hedge-fund-technicals", "macd"]) as never);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.results.map((r: { strategyId: string }) => r.strategyId)).toEqual(["macd"]);
    expect(body.skipped).toEqual([
      { strategyId: "hedge-fund-technicals", reason: expect.stringMatching(/^failed: invalid technicals volume/) },
    ]);
  });

  it("runs all registered library strategies when no IDs are supplied", async () => {
    const response = await POST(request([]) as never);

    expect(response.status).toBe(200);
    // Each strategy runs exactly once: the route no longer pre-runs them all
    // through indicatorts' backtest() just to rank them.
    for (const info of mockStrategies) {
      expect(info.strategy).toHaveBeenCalledTimes(1);
    }
  });
});

describe("POST /api/backtest-technical request validation", () => {
  const post = (body: string) =>
    POST(
      new Request("http://localhost/api/backtest-technical", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }) as never,
    );
  const base = { symbol: "AAPL", startDate: "2024-01-01", endDate: "2024-01-05" };

  it("returns 400 for a body that is not JSON, without fetching data", async () => {
    const response = await post("{not json");
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Request body must be valid JSON");
    expect(mockGetHistorical).not.toHaveBeenCalled();
  });

  it("returns 400 with every problem listed, without fetching data", async () => {
    const response = await post(
      JSON.stringify({ ...base, startDate: "2024-02-01", initialCapital: -5 }),
    );
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errors).toEqual([
      "startDate must be before endDate",
      "initialCapital must be a positive number",
    ]);
    expect(mockGetHistorical).not.toHaveBeenCalled();
  });

  it("rejects the null capital the UI sends after parseInt('') is NaN", async () => {
    const response = await post(
      JSON.stringify({ ...base, initialCapital: Number.NaN, strategyIds: ["macd"] }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("initialCapital must be a positive number");
  });

  it("still runs when optional fields are omitted", async () => {
    const response = await post(JSON.stringify(base));
    expect(response.status).toBe(200);
    expect((await response.json()).initialCapital).toBe(100000);
  });
});
