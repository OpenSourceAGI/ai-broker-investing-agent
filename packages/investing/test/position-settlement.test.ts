import { describe, expect, it } from "vitest";
import {
  settleResolvedPositions,
  type MarketResolution,
  type ResolutionMap,
} from "../src/prediction/analysis/position-settlement";
import type { StoredTrade } from "../src/prediction/analysis/position-reconstruction";
import { rMultiplesFromResolvedPositions } from "../src/prediction/analysis/r-multiple";

/** Builds a well-formed TRADE row; override any field per case. */
function trade(o: Partial<StoredTrade> = {}): StoredTrade {
  return {
    traderId: "t",
    conditionId: "c",
    type: "TRADE",
    side: "BUY",
    outcomeIndex: 0,
    size: 100,
    usdcSize: 40,
    timestamp: 1000,
    ...o,
  };
}

/** Builds a resolution map keyed by conditionId. */
function resMap(entries: Record<string, MarketResolution>): ResolutionMap {
  return new Map(Object.entries(entries));
}

describe("settleResolvedPositions — settlement payouts", () => {
  it("settles a winning YES residual at $1/share", () => {
    const result = settleResolvedPositions(
      [trade({ outcomeIndex: 0, side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.skipped).toEqual([]);
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 60, // 0 proceeds + 100 payout - 40 cost
        initialRisk: 40,
        resolved: true,
        resolutionTimestamp: 5000,
        closure: "settlement",
        residualShares: 100,
      },
    ]);
  });

  it("settles a winning NO residual (outcomeIndex 1) at $1/share", () => {
    const result = settleResolvedPositions(
      [trade({ outcomeIndex: 1, side: "BUY", size: 200, usdcSize: 60, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: 1, resolvedAt: 5000 } }),
    );
    expect(result.positions[0]).toMatchObject({
      netRealizedPnl: 140, // 200 payout - 60 cost
      initialRisk: 60,
      resolved: true,
      closure: "settlement",
      residualShares: 200,
    });
  });

  it("settles a losing residual with zero payout (the other leg won)", () => {
    const result = settleResolvedPositions(
      [trade({ outcomeIndex: 0, side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: 1, resolvedAt: 5000 } }),
    );
    expect(result.positions[0]).toMatchObject({
      netRealizedPnl: -40, // 0 payout - 40 cost
      initialRisk: 40,
      resolved: true,
      closure: "settlement",
    });
  });

  it("includes prior SELL proceeds when settling the remaining residual", () => {
    const result = settleResolvedPositions(
      [
        trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
        trade({ side: "SELL", size: 40, usdcSize: 50, timestamp: 2 }), // 60 shares left
      ],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 70, // 50 proceeds + 60 payout - 40 cost
        initialRisk: 40,
        resolved: true,
        resolutionTimestamp: 5000,
        closure: "settlement",
        residualShares: 60,
      },
    ]);
  });

  it("settles only the trailing residual after an earlier SELL-closed episode", () => {
    const result = settleResolvedPositions(
      [
        trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
        trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }), // #0 sell-close
        trade({ side: "BUY", size: 100, usdcSize: 50, timestamp: 3 }), // #1 residual
      ],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.positions).toEqual([
      { positionId: "t:c:0#0", netRealizedPnl: 60, initialRisk: 40, resolved: true, resolutionTimestamp: 2, closure: "sell-close" },
      { positionId: "t:c:0#1", netRealizedPnl: 50, initialRisk: 50, resolved: true, resolutionTimestamp: 5000, closure: "settlement", residualShares: 100 },
    ]);
  });
});

describe("settleResolvedPositions — missing / invalid labels stay unresolved", () => {
  it("leaves a residual open when no label exists for its condition", () => {
    const result = settleResolvedPositions(
      [trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })],
      resMap({}),
    );
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: -40,
        initialRisk: 40,
        resolved: false,
        resolutionTimestamp: null,
        closure: "open",
        residualShares: 100,
      },
    ]);
  });

  it("leaves a residual open for a non-finite resolvedAt", () => {
    const result = settleResolvedPositions(
      [trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: NaN } }),
    );
    expect(result.positions[0]).toMatchObject({ resolved: false, closure: "open" });
  });

  it("leaves a residual open for a non-integer winningOutcomeIndex", () => {
    const result = settleResolvedPositions(
      [trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: 1.5, resolvedAt: 5000 } }),
    );
    expect(result.positions[0]).toMatchObject({ resolved: false, closure: "open" });
  });

  it("emits no settlement position when there is no residual inventory", () => {
    const result = settleResolvedPositions(
      [
        trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
        trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      ],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.positions).toEqual([
      { positionId: "t:c:0#0", netRealizedPnl: 60, initialRisk: 40, resolved: true, resolutionTimestamp: 2, closure: "sell-close" },
    ]);
  });
});

describe("settleResolvedPositions — zero-cost residual", () => {
  it("settles a zero-cost residual (free shares) to zero risk, excluded downstream", () => {
    const result = settleResolvedPositions(
      [trade({ side: "BUY", size: 100, usdcSize: 0, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.positions[0]).toMatchObject({
      netRealizedPnl: 100, // 100 payout - 0 cost
      initialRisk: 0,
      resolved: true,
      closure: "settlement",
    });
    const conv = rMultiplesFromResolvedPositions(result.positions);
    expect(conv.rMultiples).toEqual([]);
    expect(conv.excludedCounts["non-positive-risk"]).toBe(1);
  });
});

describe("settleResolvedPositions — de-duplication by trade identity", () => {
  it("counts a fill sharing a transactionHash-outcomeIndex id only once", () => {
    const result = settleResolvedPositions(
      [
        trade({ id: "a", side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
        trade({ id: "a", side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }), // duplicate
        trade({ id: "b", side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      ],
      resMap({}),
    );
    // De-duped: one BUY + one SELL closes flat -> single sell-close, no residual.
    expect(result.positions).toEqual([
      { positionId: "t:c:0#0", netRealizedPnl: 60, initialRisk: 40, resolved: true, resolutionTimestamp: 2, closure: "sell-close" },
    ]);
  });

  it("counts id-less duplicates each (de-dup is a caller precondition without identity)", () => {
    const result = settleResolvedPositions(
      [
        trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }), // no id
        trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }), // no id, counted again
        trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      ],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    // Both buys counted -> 200 shares, sell 100 -> 100 residual, then settled.
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 120, // 100 proceeds + 100 payout - 80 cost
        initialRisk: 80,
        resolved: true,
        resolutionTimestamp: 5000,
        closure: "settlement",
        residualShares: 100,
      },
    ]);
  });
});

describe("settleResolvedPositions — malformed / invalid inputs", () => {
  it("throws TypeError when trades is not an array", () => {
    // @ts-expect-error intentional bad input
    expect(() => settleResolvedPositions(null, resMap({}))).toThrow(TypeError);
  });

  it("throws TypeError when resolutions is not a Map", () => {
    // @ts-expect-error intentional bad input
    expect(() => settleResolvedPositions([], {})).toThrow(TypeError);
  });

  it("throws RangeError for a negative sharesEpsilon", () => {
    expect(() =>
      settleResolvedPositions([], resMap({}), { sharesEpsilon: -1 }),
    ).toThrow(RangeError);
  });

  it("skips non-TRADE rows and still settles the TRADE residual", () => {
    const result = settleResolvedPositions(
      [
        trade({ id: "r1", type: "REDEEM", side: null, usdcSize: 100, timestamp: 3 }),
        trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      ],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.skipped).toEqual([{ key: "row r1", reason: "non-trade-type" }]);
    expect(result.positions[0]).toMatchObject({ closure: "settlement", netRealizedPnl: 60 });
  });

  it("poisons the whole group when a TRADE row has a null side", () => {
    const result = settleResolvedPositions(
      [
        trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
        trade({ side: null, size: 100, usdcSize: 100, timestamp: 2 }),
      ],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "missing-fields" }]);
  });

  it("skips an oversell and emits no settlement for that group", () => {
    const result = settleResolvedPositions(
      [
        trade({ side: "BUY", size: 50, usdcSize: 20, timestamp: 1 }),
        trade({ side: "SELL", size: 100, usdcSize: 90, timestamp: 2 }),
      ],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "oversold" }]);
  });

  it("keeps distinct trader/condition/outcome groups separate", () => {
    const result = settleResolvedPositions(
      [
        trade({ traderId: "alice", conditionId: "c", outcomeIndex: 0, side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
        trade({ traderId: "bob", conditionId: "c", outcomeIndex: 0, side: "BUY", size: 100, usdcSize: 55, timestamp: 1 }),
      ],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.positions.map((p) => p.positionId)).toEqual([
      "alice:c:0#0",
      "bob:c:0#0",
    ]);
    expect(result.positions.map((p) => p.netRealizedPnl)).toEqual([60, 45]);
  });

  it("does not mutate the input trades array", () => {
    const rows = [trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })];
    const snapshot = JSON.parse(JSON.stringify(rows));
    settleResolvedPositions(rows, resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }));
    expect(rows).toEqual(snapshot);
  });
});

describe("settleResolvedPositions — temporal consistency (resolvedAt vs fills)", () => {
  it("does not settle when resolvedAt predates the only BUY; stays open", () => {
    const result = settleResolvedPositions(
      [trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 100 })],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 50 } }),
    );
    expect(result.positions[0]).toMatchObject({
      resolved: false,
      resolutionTimestamp: null,
      closure: "open",
      residualShares: 100,
    });
  });

  it("an impossible early resolvedAt cannot become an included R-multiple (no look-ahead)", () => {
    const { positions } = settleResolvedPositions(
      [trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 100 })],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 50 } }),
    );
    const conv = rMultiplesFromResolvedPositions(positions, { cutoff: 75 });
    expect(conv.rMultiples).toEqual([]);
    expect(conv.excludedCounts.unresolved).toBe(1);
    expect(conv.excludedCounts["after-cutoff"]).toBe(0);
  });

  it("settles when resolvedAt equals the latest contributing fill timestamp (boundary)", () => {
    const result = settleResolvedPositions(
      [trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 100 })],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 100 } }),
    );
    expect(result.positions[0]).toMatchObject({
      resolved: true,
      closure: "settlement",
      resolutionTimestamp: 100,
    });
  });

  it("considers ALL contributing fills, including a later SELL, for the temporal check", () => {
    const rows = [
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 40, usdcSize: 50, timestamp: 10 }), // latest fill t=10; 60 residual
    ];
    // resolvedAt=5 is after the BUY (t=1) but BEFORE the SELL (t=10) -> refuse.
    expect(
      settleResolvedPositions(rows, resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5 } })).positions[0],
    ).toMatchObject({ resolved: false, closure: "open" });
    // resolvedAt=10 (== latest fill) -> settle; proceeds+payout-cost = 50+60-40.
    expect(
      settleResolvedPositions(rows, resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 10 } })).positions[0],
    ).toMatchObject({ resolved: true, closure: "settlement", netRealizedPnl: 70 });
  });
});

describe("settleResolvedPositions — binary outcome validation", () => {
  it("leaves a residual open for winningOutcomeIndex 2 (unsupported, not a fabricated loss)", () => {
    const result = settleResolvedPositions(
      [trade({ outcomeIndex: 0, side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: 2, resolvedAt: 5000 } }),
    );
    expect(result.positions[0]).toMatchObject({ resolved: false, closure: "open" });
  });

  it("leaves a residual open for a negative winningOutcomeIndex", () => {
    const result = settleResolvedPositions(
      [trade({ outcomeIndex: 0, side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: -1, resolvedAt: 5000 } }),
    );
    expect(result.positions[0]).toMatchObject({ resolved: false, closure: "open" });
  });

  it("rejects a fill whose outcomeIndex is outside {0,1} as an invalid row (not a loss)", () => {
    const result = settleResolvedPositions(
      [trade({ id: "bad", outcomeIndex: 2, side: "BUY", size: 100, usdcSize: 40, timestamp: 1 })],
      resMap({ c: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "row bad", reason: "missing-fields" }]);
  });
});

describe("settleResolvedPositions -> rMultiplesFromResolvedPositions integration", () => {
  it("settled and SELL-closed positions flow into R-multiples", () => {
    const { positions } = settleResolvedPositions(
      [
        trade({ conditionId: "c1", side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
        trade({ conditionId: "c1", side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }), // +1.5R sell-close
        trade({ conditionId: "c2", side: "BUY", size: 100, usdcSize: 40, timestamp: 3 }), // settled winner
      ],
      resMap({ c2: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    const conv = rMultiplesFromResolvedPositions(positions);
    expect(conv.rMultiples).toEqual([1.5, 1.5]); // 60/40 and (100-40)/40
  });

  it("the market resolution timestamp drives leak-free cutoff gating", () => {
    const { positions } = settleResolvedPositions(
      [
        trade({ conditionId: "c1", side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
        trade({ conditionId: "c1", side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }), // sell-close @t=2
        trade({ conditionId: "c2", side: "BUY", size: 100, usdcSize: 40, timestamp: 3 }), // settled @resolvedAt=5000
      ],
      resMap({ c2: { winningOutcomeIndex: 0, resolvedAt: 5000 } }),
    );
    const conv = rMultiplesFromResolvedPositions(positions, { cutoff: 3000 });
    expect(conv.rMultiples).toEqual([1.5]); // only the SELL-close known by t=3000
    expect(conv.excludedCounts["after-cutoff"]).toBe(1); // settlement at 5000 excluded
  });
});
