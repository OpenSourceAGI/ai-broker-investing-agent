import { describe, expect, it, vi } from "vitest";

const getTraderTradesThroughCutoff = vi.hoisted(() => vi.fn());

vi.mock("../src/prediction/db/trade-history", () => ({
  getTraderTradesThroughCutoff,
}));

import { loadPolymarketWalletTrustInputs } from "../src/prediction/analysis/polymarket-wallet-trust";

describe("loadPolymarketWalletTrustInputs", () => {
  it("loads the wallet through the inclusive cutoff and runs the pure adapter", async () => {
    getTraderTradesThroughCutoff.mockResolvedValue([
      {
        id: "buy",
        traderId: "0xwallet",
        conditionId: "condition",
        type: "TRADE",
        side: "BUY",
        outcomeIndex: 0,
        size: 100,
        usdcSize: 40,
        timestamp: new Date(10_000),
      },
      {
        id: "sell",
        traderId: "0xwallet",
        conditionId: "condition",
        type: "TRADE",
        side: "SELL",
        outcomeIndex: 0,
        size: 100,
        usdcSize: 100,
        timestamp: new Date(20_000),
      },
    ]);

    const result = await loadPolymarketWalletTrustInputs("0xwallet", 20);

    expect(getTraderTradesThroughCutoff).toHaveBeenCalledWith(
      "0xwallet",
      new Date(20_000),
    );
    expect(result.rMultiples).toEqual([1.5]);
    expect(result.coverage.historyCompleteness).toBe("unknown");
  });
});
