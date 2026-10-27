import { describe, expect, it } from "vitest";
import {
  buildPolymarketWalletTrustInputs,
  type StoredWalletTradeRow,
} from "../src/prediction/analysis/polymarket-wallet-trust";

const WALLET = "0xwallet";

function row(
  overrides: Partial<StoredWalletTradeRow> = {},
): StoredWalletTradeRow {
  return {
    id: "trade-1",
    traderId: WALLET,
    conditionId: "condition-1",
    type: "TRADE",
    side: "BUY",
    outcomeIndex: 0,
    size: 100,
    usdcSize: 40,
    timestamp: new Date(1_000),
    ...overrides,
  };
}

describe("buildPolymarketWalletTrustInputs", () => {
  it("builds R-multiples and TRUST inputs from multi-fill SELL-closed episodes", () => {
    const result = buildPolymarketWalletTrustInputs(
      WALLET,
      100,
      [
        row({ id: "a", size: 50, usdcSize: 20, timestamp: new Date(10_000) }),
        row({ id: "b", size: 50, usdcSize: 25, timestamp: new Date(11_000) }),
        row({ id: "c", side: "SELL", size: 40, usdcSize: 30, timestamp: new Date(12_000) }),
        row({ id: "d", side: "SELL", size: 60, usdcSize: 60, timestamp: new Date(13_000) }),
        row({ id: "e", conditionId: "condition-2", size: 100, usdcSize: 80, timestamp: new Date(20_000) }),
        row({ id: "f", conditionId: "condition-2", side: "SELL", size: 100, usdcSize: 40, timestamp: new Date(21_000) }),
      ],
      { minSampleSize: 2 },
    );

    expect(result.wallet).toEqual({ kind: "polymarket-proxy-wallet", id: WALLET });
    expect(result.coverage).toEqual({
      basis: "sell-closed-only",
      historyCompleteness: "unknown",
      resolutionEvidence: "none",
    });
    expect(result.rMultiples).toEqual([1, -0.5]);
    expect(result.includedPositions).toBe(2);
    expect(result.reconstructionSkips).toEqual([]);
    expect(result.rMultipleExclusions).toEqual([]);
    expect(result.trust).toMatchObject({
      sampleSize: 2,
      meanR: 0.25,
      hasSufficientSample: true,
      reliable: true,
      reason: "ok",
    });
  });

  it("filters post-cutoff fills before they can close or poison an earlier episode", () => {
    const result = buildPolymarketWalletTrustInputs(WALLET, 20, [
      row({ id: "buy", timestamp: new Date(10_000) }),
      row({ id: "bad-future", side: "invalid", timestamp: new Date(30_000) }),
      row({ id: "oversell-future", side: "SELL", size: 101, usdcSize: 80, timestamp: new Date(40_000) }),
    ]);

    expect(result.reconstructionSkips).toEqual([]);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      closure: "open",
      resolved: false,
      resolutionTimestamp: null,
    });
    expect(result.rMultiples).toEqual([]);
    expect(result.rMultipleExclusions).toEqual([
      { positionId: `${WALLET}:condition-1:0#0`, reason: "unresolved" },
    ]);
  });

  it("includes a closing fill exactly at the inclusive cutoff", () => {
    const result = buildPolymarketWalletTrustInputs(WALLET, 20, [
      row({ id: "buy", timestamp: new Date(10_000) }),
      row({ id: "sell", side: "SELL", usdcSize: 100, timestamp: new Date(20_000) }),
    ]);

    expect(result.rMultiples).toEqual([1.5]);
    expect(result.positions[0]).toMatchObject({
      closure: "sell-close",
      resolutionTimestamp: 20,
    });
  });

  it("keeps residual inventory unresolved when no resolution labels are supplied", () => {
    const result = buildPolymarketWalletTrustInputs(WALLET, 20, [
      row({ id: "buy", timestamp: new Date(10_000) }),
    ]);

    expect(result.positions[0]).toMatchObject({
      closure: "open",
      residualShares: 100,
      resolved: false,
    });
    expect(result.rMultiples).toEqual([]);
    expect(result.trust.reason).toBe("empty");
  });

  it("uses Day 4's existing non-empty-ID deduplication", () => {
    const duplicate = row({ id: "same", timestamp: new Date(10_000) });
    const result = buildPolymarketWalletTrustInputs(WALLET, 20, [
      duplicate,
      { ...duplicate },
      row({ id: "sell", side: "SELL", usdcSize: 100, timestamp: new Date(20_000) }),
    ]);

    expect(result.positions).toHaveLength(1);
    expect(result.rMultiples).toEqual([1.5]);
  });

  it("does not coerce malformed financial fields to a zero-cost position", () => {
    const result = buildPolymarketWalletTrustInputs(WALLET, 20, [
      row({ id: "bad", usdcSize: Number.NaN, timestamp: new Date(10_000) }),
      row({ id: "sell", side: "SELL", usdcSize: 100, timestamp: new Date(20_000) }),
    ]);

    expect(result.positions).toEqual([]);
    expect(result.rMultiples).toEqual([]);
    expect(result.reconstructionSkips).toEqual([
      { key: `${WALLET}:condition-1:0`, reason: "missing-fields" },
    ]);
  });

  it("preserves Day 4 binary-outcome validation", () => {
    const result = buildPolymarketWalletTrustInputs(WALLET, 20, [
      row({ id: "bad-leg", outcomeIndex: 2, timestamp: new Date(10_000) }),
    ]);

    expect(result.positions).toEqual([]);
    expect(result.rMultiples).toEqual([]);
    expect(result.reconstructionSkips).toEqual([
      { key: "row bad-leg", reason: "missing-fields" },
    ]);
  });

  it("rejects rows belonging to a different wallet", () => {
    expect(() =>
      buildPolymarketWalletTrustInputs(WALLET, 20, [
        row({ traderId: "0xother" }),
      ]),
    ).toThrow("every trade row must belong to the requested wallet");
  });
});
