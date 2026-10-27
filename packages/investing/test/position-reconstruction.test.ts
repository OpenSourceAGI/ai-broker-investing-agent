import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHARES_EPSILON,
  reconstructResolvedPositions,
  type StoredTrade,
} from "../src/prediction/analysis/position-reconstruction";
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

describe("reconstructResolvedPositions — basics", () => {
  it("returns empty positions and skips for empty input", () => {
    expect(reconstructResolvedPositions([])).toEqual({
      positions: [],
      skipped: [],
    });
  });

  it("reconstructs a single BUY->SELL winning episode", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 60,
        initialRisk: 40,
        resolved: true,
        resolutionTimestamp: 2,
      },
    ]);
  });

  it("reconstructs a losing episode (negative P&L)", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 10, timestamp: 2 }),
    ]);
    expect(result.positions[0]).toMatchObject({
      netRealizedPnl: -30,
      initialRisk: 40,
      resolved: true,
    });
  });

  it("reconstructs a break-even episode (zero P&L)", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 40, timestamp: 2 }),
    ]);
    expect(result.positions[0]).toMatchObject({
      netRealizedPnl: 0,
      initialRisk: 40,
      resolved: true,
    });
  });

  it("sums multiple BUY fills into one cost basis before a full SELL exit", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 60, usdcSize: 24, timestamp: 1 }),
      trade({ side: "BUY", size: 40, usdcSize: 20, timestamp: 2 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 3 }),
    ]);
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 56,
        initialRisk: 44,
        resolved: true,
        resolutionTimestamp: 3,
      },
    ]);
  });

  it("nets a partial scale-out followed by a full exit into one episode", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 40, usdcSize: 50, timestamp: 2 }),
      trade({ side: "SELL", size: 60, usdcSize: 60, timestamp: 3 }),
    ]);
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 70, // (50 + 60) - 40
        initialRisk: 40,
        resolved: true,
        resolutionTimestamp: 3,
      },
    ]);
  });
});

describe("reconstructResolvedPositions — sequential episodes", () => {
  it("splits two sequential open-to-flat episodes in the same trader/market/outcome", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      trade({ side: "BUY", size: 100, usdcSize: 50, timestamp: 3 }),
      trade({ side: "SELL", size: 100, usdcSize: 30, timestamp: 4 }),
    ]);
    expect(result.positions).toEqual([
      { positionId: "t:c:0#0", netRealizedPnl: 60, initialRisk: 40, resolved: true, resolutionTimestamp: 2 },
      { positionId: "t:c:0#1", netRealizedPnl: -20, initialRisk: 50, resolved: true, resolutionTimestamp: 4 },
    ]);
  });

  it("keeps distinct outcome legs as separate groups", () => {
    const result = reconstructResolvedPositions([
      trade({ outcomeIndex: 0, side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ outcomeIndex: 0, side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      trade({ outcomeIndex: 1, side: "BUY", size: 100, usdcSize: 55, timestamp: 1 }),
      trade({ outcomeIndex: 1, side: "SELL", size: 100, usdcSize: 70, timestamp: 2 }),
    ]);
    expect(result.positions.map((p) => p.positionId)).toEqual([
      "t:c:0#0",
      "t:c:1#0",
    ]);
  });
});

describe("reconstructResolvedPositions — residual inventory stays unresolved", () => {
  it("emits trailing open inventory as a single unresolved position", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 40, usdcSize: 50, timestamp: 2 }),
    ]);
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 10, // provisional; ignored downstream
        initialRisk: 40,
        resolved: false,
        resolutionTimestamp: null,
      },
    ]);
  });

  it("emits a closed episode then leaves a later re-open unresolved", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      trade({ side: "BUY", size: 50, usdcSize: 25, timestamp: 3 }),
    ]);
    expect(result.positions).toEqual([
      { positionId: "t:c:0#0", netRealizedPnl: 60, initialRisk: 40, resolved: true, resolutionTimestamp: 2 },
      { positionId: "t:c:0#1", netRealizedPnl: -25, initialRisk: 25, resolved: false, resolutionTimestamp: null },
    ]);
  });
});

describe("reconstructResolvedPositions — inconsistent / incomplete history", () => {
  it("skips a SELL with no recorded BUY as no-buys", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "SELL", size: 100, usdcSize: 50, timestamp: 1 }),
    ]);
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "no-buys" }]);
  });

  it("skips an oversell (sold more than bought) as oversold", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 50, usdcSize: 20, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 90, timestamp: 2 }),
    ]);
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "oversold" }]);
  });

  it("keeps earlier clean episodes but skips the group at the point of oversell", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      trade({ side: "SELL", size: 50, usdcSize: 30, timestamp: 3 }), // no inventory now
    ]);
    expect(result.positions).toEqual([
      { positionId: "t:c:0#0", netRealizedPnl: 60, initialRisk: 40, resolved: true, resolutionTimestamp: 2 },
    ]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "no-buys" }]);
  });
});

describe("reconstructResolvedPositions — row/field validation", () => {
  it("skips non-TRADE rows and still reconstructs the TRADE fills", () => {
    const result = reconstructResolvedPositions([
      trade({ id: "r1", type: "REDEEM", side: null, usdcSize: 100, timestamp: 3 }),
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
    ]);
    expect(result.skipped).toEqual([{ key: "row r1", reason: "non-trade-type" }]);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({ resolved: true, netRealizedPnl: 60 });
  });

  it("poisons the whole group when a TRADE row has a null side", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: null, size: 100, usdcSize: 100, timestamp: 2 }),
    ]);
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "missing-fields" }]);
  });

  it("poisons the group for a non-finite size", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: NaN, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
    ]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "missing-fields" }]);
    expect(result.positions).toEqual([]);
  });

  it("poisons the group for a non-positive size", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 0, usdcSize: 40, timestamp: 1 }),
    ]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "missing-fields" }]);
  });

  it("poisons the group for a negative usdcSize", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: -40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
    ]);
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "missing-fields" }]);
  });

  it("poisons the group for a non-finite timestamp", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: Infinity }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
    ]);
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "missing-fields" }]);
  });

  it("DISCARDS a completed episode when a later malformed row poisons its group", () => {
    // Policy: a malformed row is dropped before its timeline position is known,
    // so the whole group is unsafe to trust — even an episode that already
    // cleanly opened and closed before it. This is intentionally stricter than
    // the oversell policy (whose offending fill has a known timestamp).
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }), // episode #0 closes cleanly
      trade({ side: null, size: 100, usdcSize: 30, timestamp: 3 }), // malformed -> poisons group
    ]);
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "missing-fields" }]);
  });

  it("keeps different trader IDs with identical market/outcome as separate groups", () => {
    const result = reconstructResolvedPositions([
      trade({ traderId: "alice", side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ traderId: "alice", side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      trade({ traderId: "bob", side: "BUY", size: 100, usdcSize: 55, timestamp: 1 }),
      trade({ traderId: "bob", side: "SELL", size: 100, usdcSize: 70, timestamp: 2 }),
    ]);
    expect(result.positions.map((p) => p.positionId)).toEqual([
      "alice:c:0#0",
      "bob:c:0#0",
    ]);
    expect(result.positions.map((p) => p.netRealizedPnl)).toEqual([60, 15]);
  });

  it("skips an ungroupable row (null outcomeIndex) at row level", () => {
    const result = reconstructResolvedPositions([
      trade({ id: "bad", outcomeIndex: null, side: "BUY", timestamp: 1 }),
    ]);
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "row bad", reason: "missing-fields" }]);
  });

  it("skips a non-object row", () => {
    const result = reconstructResolvedPositions([
      // @ts-expect-error intentional malformed element
      null,
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
    ]);
    expect(result.skipped).toEqual([{ key: "row #0", reason: "missing-fields" }]);
    expect(result.positions).toHaveLength(1);
  });

  it("throws TypeError when trades is not an array", () => {
    // @ts-expect-error intentional bad input
    expect(() => reconstructResolvedPositions(null)).toThrow(TypeError);
  });

  it("throws RangeError for a negative sharesEpsilon", () => {
    expect(() =>
      reconstructResolvedPositions([], { sharesEpsilon: -1 }),
    ).toThrow(RangeError);
  });
});

describe("reconstructResolvedPositions — ordering & determinism", () => {
  it("orders fills by timestamp regardless of input order", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
    ]);
    expect(result.positions).toEqual([
      { positionId: "t:c:0#0", netRealizedPnl: 60, initialRisk: 40, resolved: true, resolutionTimestamp: 2 },
    ]);
  });

  it("is deterministic: identical input yields identical output", () => {
    const rows = [
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
    ];
    expect(reconstructResolvedPositions(rows)).toEqual(
      reconstructResolvedPositions(rows),
    );
  });

  it("breaks equal timestamps by input order: BUY-before-SELL closes cleanly", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 5 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 5 }),
    ]);
    expect(result.positions).toHaveLength(1);
    expect(result.skipped).toEqual([]);
  });

  it("breaks equal timestamps by input order: SELL-before-BUY looks like an oversell (documented ambiguity)", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 5 }),
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 5 }),
    ]);
    expect(result.positions).toEqual([]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "no-buys" }]);
  });

  it("does not mutate the input array or its elements", () => {
    const rows = [
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }),
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(rows));
    reconstructResolvedPositions(rows);
    expect(rows).toEqual(snapshot);
  });
});

describe("reconstructResolvedPositions — floating-point dust vs material inventory", () => {
  it("absorbs float dust so a near-flat episode closes", () => {
    // 0.1 + 0.1 + 0.1 === 0.30000000000000004; selling 0.3 leaves ~5.5e-17.
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 0.1, usdcSize: 4, timestamp: 1 }),
      trade({ side: "BUY", size: 0.1, usdcSize: 4, timestamp: 2 }),
      trade({ side: "BUY", size: 0.1, usdcSize: 4, timestamp: 3 }),
      trade({ side: "SELL", size: 0.3, usdcSize: 15, timestamp: 4 }),
    ]);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      resolved: true,
      netRealizedPnl: 3, // 15 - 12
      resolutionTimestamp: 4,
    });
  });

  it("does not round away material residual inventory (1 share left)", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 99, usdcSize: 99, timestamp: 2 }),
    ]);
    expect(result.positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 59,
        initialRisk: 40,
        resolved: false,
        resolutionTimestamp: null,
      },
    ]);
  });

  it("treats a material negative inventory as an oversell, not dust", () => {
    const result = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100.5, usdcSize: 100, timestamp: 2 }),
    ]);
    expect(result.skipped).toEqual([{ key: "t:c:0", reason: "oversold" }]);
    expect(result.positions).toEqual([]);
  });

  it("exposes the default epsilon", () => {
    expect(DEFAULT_SHARES_EPSILON).toBe(1e-9);
  });
});

describe("reconstructResolvedPositions — custom sharesEpsilon", () => {
  it("uses a custom epsilon to decide flatness (small residual stays open by default)", () => {
    const rows = [
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 99.5, usdcSize: 99, timestamp: 2 }), // 0.5 shares left
    ];
    // Default dust epsilon: 0.5 shares is material -> unresolved.
    expect(reconstructResolvedPositions(rows).positions[0]).toMatchObject({
      resolved: false,
      resolutionTimestamp: null,
    });
  });

  it("demonstrates why an excessively large epsilon is UNSAFE (masks material inventory)", () => {
    const rows = [
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 99.5, usdcSize: 99, timestamp: 2 }), // 0.5 shares left
    ];
    // An oversized epsilon wrongly treats 0.5 real shares as dust and emits a
    // bogus resolved position — the documented hazard, not recommended usage.
    const result = reconstructResolvedPositions(rows, { sharesEpsilon: 1 });
    expect(result.positions[0]).toMatchObject({
      resolved: true,
      netRealizedPnl: 59,
      initialRisk: 40,
    });
  });

  it("a large epsilon can also mask a material oversell (classified as flat)", () => {
    const rows = [
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100.5, usdcSize: 100, timestamp: 2 }), // -0.5 shares
    ];
    // Default: a real oversell. With a 1-share epsilon the mismatch is hidden
    // and the episode is (incorrectly) closed flat.
    expect(reconstructResolvedPositions(rows).skipped).toEqual([
      { key: "t:c:0", reason: "oversold" },
    ]);
    expect(
      reconstructResolvedPositions(rows, { sharesEpsilon: 1 }).positions[0],
    ).toMatchObject({ resolved: true });
  });
});

describe("reconstructResolvedPositions -> rMultiplesFromResolvedPositions integration", () => {
  it("emits a zero-risk position for a zero-cost BUY that the R-multiple converter excludes", () => {
    const { positions } = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 0, timestamp: 1 }), // free shares
      trade({ side: "SELL", size: 100, usdcSize: 0, timestamp: 2 }), // closes flat
    ]);
    expect(positions).toEqual([
      {
        positionId: "t:c:0#0",
        netRealizedPnl: 0,
        initialRisk: 0,
        resolved: true,
        resolutionTimestamp: 2,
      },
    ]);
    // Downstream, a zero initialRisk is correctly dropped (not a 0R, not ∞).
    const conv = rMultiplesFromResolvedPositions(positions);
    expect(conv.rMultiples).toEqual([]);
    expect(conv.excludedCounts["non-positive-risk"]).toBe(1);
  });

  it("feeds reconstructed resolved episodes straight into R-multiples", () => {
    const { positions } = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }), // +1.5R
      trade({ side: "BUY", size: 100, usdcSize: 50, timestamp: 3 }),
      trade({ side: "SELL", size: 100, usdcSize: 30, timestamp: 4 }), // -0.4R
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 5 }), // residual -> unresolved
    ]);
    const conv = rMultiplesFromResolvedPositions(positions);
    expect(conv.rMultiples).toEqual([1.5, -0.4]);
    expect(conv.excludedCounts.unresolved).toBe(1);
  });

  it("the closure timestamp drives leak-free cutoff gating downstream", () => {
    const { positions } = reconstructResolvedPositions([
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 1 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 2 }), // closes at t=2
      trade({ side: "BUY", size: 100, usdcSize: 40, timestamp: 3 }),
      trade({ side: "SELL", size: 100, usdcSize: 100, timestamp: 4 }), // closes at t=4
    ]);
    const conv = rMultiplesFromResolvedPositions(positions, { cutoff: 3 });
    expect(conv.rMultiples).toEqual([1.5]); // only the episode closed by t=3
    expect(conv.excludedCounts["after-cutoff"]).toBe(1);
  });
});
