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

describe("POST /api/backtest-technical enhanced capabilities", () => {
  const postJson = (payload: Record<string, unknown>) =>
    POST(
      new Request("http://localhost/api/backtest-technical", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: "AAPL",
          startDate: "2024-01-01",
          endDate: "2024-01-05",
          ...payload,
        }),
      }) as never,
    );

  it("reduces finalValue and totalReturn when feeBps and slippageBps are non-zero", async () => {
    const zeroCostRes = await postJson({ strategyIds: ["buy-hold"], feeBps: 0, slippageBps: 0 });
    const withCostsRes = await postJson({ strategyIds: ["buy-hold"], feeBps: 50, slippageBps: 50 });

    expect(zeroCostRes.status).toBe(200);
    expect(withCostsRes.status).toBe(200);

    const zeroCost = await zeroCostRes.json();
    const withCosts = await withCostsRes.json();

    expect(withCosts.feeBps).toBe(50);
    expect(withCosts.slippageBps).toBe(50);
    expect(withCosts.results[0].finalValue).toBeLessThan(zeroCost.results[0].finalValue);
    expect(withCosts.results[0].totalReturn).toBeLessThan(zeroCost.results[0].totalReturn);
  });

  it("limits capital deployed per trade when positionSizePercent is below 100", async () => {
    const fullRes = await postJson({ strategyIds: ["buy-hold"], positionSizePercent: 100 });
    const halfRes = await postJson({ strategyIds: ["buy-hold"], positionSizePercent: 50 });

    expect(fullRes.status).toBe(200);
    expect(halfRes.status).toBe(200);

    const full = await fullRes.json();
    const half = await halfRes.json();

    expect(half.positionSizePercent).toBe(50);
    expect(full.results[0].finalValue).toBe(120000);
    expect(half.results[0].finalValue).toBe(110000);
    expect(half.results[0].totalReturn).toBeLessThan(full.results[0].totalReturn);
  });

  it("returns deterministic results in demoMode without calling yahooFinance.getHistorical", async () => {
    const payload = {
      symbol: "NVDA",
      startDate: "2024-01-01",
      endDate: "2024-03-01",
      strategyIds: ["macd"],
      demoMode: true,
    };

    const res1 = await postJson(payload);
    const res2 = await postJson(payload);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(mockGetHistorical).not.toHaveBeenCalled();

    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.demoMode).toBe(true);
    expect(body1.results).toHaveLength(1);
    expect(body1.results).toEqual(body2.results);
  });

  it("falls back to deterministic fixture bars when yahooFinance.getHistorical rejects or fails", async () => {
    mockGetHistorical.mockRejectedValueOnce(new Error("network down"));
    const rejectedRes = await postJson({ strategyIds: ["macd"] });
    expect(rejectedRes.status).toBe(200);
    const rejectedBody = await rejectedRes.json();
    expect(rejectedBody.success).toBe(true);
    expect(rejectedBody.results).toHaveLength(1);

    mockGetHistorical.mockResolvedValueOnce({ success: false });
    const failedRes = await postJson({ strategyIds: ["macd"] });
    expect(failedRes.status).toBe(200);
    const failedBody = await failedRes.json();
    expect(failedBody.success).toBe(true);
    expect(failedBody.results).toHaveLength(1);
    expect(failedBody.results).toEqual(rejectedBody.results);
  });

  it("reports explicit unsupported/advisory reasons for non-equity bots while completing valid equity strategies", async () => {
    const res = await postJson({
      strategyIds: ["macd", "kalshi-vibe", "gabagool", "btc15m-fusion", "red-flags"],
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.results.map((r: { strategyId: string }) => r.strategyId)).toEqual(["macd"]);
    expect(body.skipped).toEqual([
      {
        strategyId: "kalshi-vibe",
        reason: expect.stringContaining("unsupported asset type"),
      },
      {
        strategyId: "gabagool",
        reason: expect.stringContaining("unsupported asset type"),
      },
      {
        strategyId: "btc15m-fusion",
        reason: expect.stringContaining("unsupported asset type"),
      },
      {
        strategyId: "red-flags",
        reason: expect.stringContaining("advisory only"),
      },
    ]);
  });
});
