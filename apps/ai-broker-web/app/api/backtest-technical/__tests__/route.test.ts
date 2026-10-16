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

import { backtest } from "indicatorts";
import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";
import { POST } from "../route";

const mockBacktest = backtest as unknown as ReturnType<typeof vi.fn>;
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
    expect(mockBacktest.mock.calls[0][1]).toEqual([
      mockStrategies[1],
      mockStrategies[2],
    ]);
    expect(
      body.results
        .map((result: { strategyId: string }) => result.strategyId)
        .sort(),
    ).toEqual(["bollinger-bands", "macd"]);
  });

  it("ignores unknown catalog IDs without changing selection behavior", async () => {
    const response = await POST(request(["tradingview-id", "macd"]) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockBacktest.mock.calls[0][1]).toEqual([mockStrategies[1]]);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      strategyId: "macd",
      strategyName: "MACD Strategy",
    });
  });

  it("runs all registered library strategies when no IDs are supplied", async () => {
    const response = await POST(request([]) as never);

    expect(response.status).toBe(200);
    expect(mockBacktest.mock.calls[0][1]).toEqual(mockStrategies);
  });
});
