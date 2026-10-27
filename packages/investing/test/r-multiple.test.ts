import { describe, expect, it } from "vitest";
import {
  R_MULTIPLE_EXCLUSION_REASONS,
  rMultiplesFromResolvedPositions,
  type ResolvedPosition,
} from "../src/prediction/analysis/r-multiple";

/**
 * Hand-calculated fixtures from the reviewed R-multiple specification. Each
 * builds a fully-netted ResolvedPosition; the YES/NO distinction is folded into
 * the signed netRealizedPnl / initialRisk before the pure function sees it.
 *
 * `R = netRealizedPnl / initialRisk`, unrounded.
 */
function pos(overrides: Partial<ResolvedPosition> = {}): ResolvedPosition {
  return {
    positionId: "p",
    netRealizedPnl: 0,
    initialRisk: 1,
    resolved: true,
    resolutionTimestamp: 1000,
    ...overrides,
  };
}

describe("rMultiplesFromResolvedPositions — included R-multiples", () => {
  it("scores a winning YES position (100 YES @0.40 -> redeem $100) at +1.5R", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "win-yes", netRealizedPnl: 60, initialRisk: 40 }),
    ]);
    expect(result.rMultiples).toEqual([1.5]);
    expect(result.included).toBe(1);
    expect(result.excluded).toEqual([]);
  });

  it("scores a full-loss YES position (100 YES @0.40 -> $0) at exactly -1R", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "loss-yes", netRealizedPnl: -40, initialRisk: 40 }),
    ]);
    expect(result.rMultiples).toEqual([-1]);
  });

  it("scores a winning NO position (200 NO @0.30 -> NO wins $200) at +2.333R", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "win-no", netRealizedPnl: 140, initialRisk: 60 }),
    ]);
    expect(result.rMultiples).toHaveLength(1);
    expect(result.rMultiples[0]).toBeCloseTo(140 / 60, 12);
  });

  it("scores a full-loss NO position (200 NO @0.30 -> $0) at exactly -1R", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "loss-no", netRealizedPnl: -60, initialRisk: 60 }),
    ]);
    expect(result.rMultiples).toEqual([-1]);
  });

  it("folds fees into P&L and the risk denominator (+$1 entry, -$2 settle)", () => {
    // Buy 100 @0.40 with $1 entry fee -> risk 41; win $100 less $2 settle fee
    // -> net 98 - 41 = 57.
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "fees", netRealizedPnl: 57, initialRisk: 41 }),
    ]);
    expect(result.rMultiples[0]).toBeCloseTo(57 / 41, 12);
  });

  it("treats a scale-in as one position summing all fill costs (60@0.40 + 40@0.50)", () => {
    // Cost 24 + 20 = 44; win $100 -> net 56.
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "scale-in", netRealizedPnl: 56, initialRisk: 44 }),
    ]);
    expect(result.rMultiples[0]).toBeCloseTo(56 / 44, 12);
  });

  it("keeps a break-even position as a real 0R observation", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "break-even", netRealizedPnl: 0, initialRisk: 40 }),
    ]);
    expect(result.rMultiples).toEqual([0]);
    expect(result.included).toBe(1);
  });
});

describe("rMultiplesFromResolvedPositions — soft exclusions", () => {
  it("excludes unresolved (open) positions", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "open", netRealizedPnl: 12, resolved: false }),
    ]);
    expect(result.rMultiples).toEqual([]);
    expect(result.included).toBe(0);
    expect(result.excluded).toEqual([{ positionId: "open", reason: "unresolved" }]);
    expect(result.excludedCounts.unresolved).toBe(1);
  });

  it("excludes zero-risk positions without emitting Infinity", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "zero-risk", netRealizedPnl: 5, initialRisk: 0 }),
    ]);
    expect(result.rMultiples).toEqual([]);
    expect(result.excluded).toEqual([
      { positionId: "zero-risk", reason: "non-positive-risk" },
    ]);
  });

  it("excludes negative-risk positions as non-positive-risk", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "neg-risk", netRealizedPnl: 5, initialRisk: -3 }),
    ]);
    expect(result.excludedCounts["non-positive-risk"]).toBe(1);
  });

  it("excludes a NaN initial risk as non-finite", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "nan-risk", netRealizedPnl: -3, initialRisk: NaN }),
    ]);
    expect(result.excluded).toEqual([
      { positionId: "nan-risk", reason: "non-finite" },
    ]);
  });

  it("excludes a +Infinity initial risk as non-finite (never a spurious 0R)", () => {
    // Regression: `+Infinity > minInitialRisk` is true, so a finite P&L would
    // divide to 0 and slip in as a fake 0R unless risk finiteness is checked first.
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "pos-inf-risk", netRealizedPnl: 50, initialRisk: Infinity }),
    ]);
    expect(result.rMultiples).toEqual([]);
    expect(result.excluded).toEqual([
      { positionId: "pos-inf-risk", reason: "non-finite" },
    ]);
  });

  it("excludes a -Infinity initial risk as non-finite", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "neg-inf-risk", netRealizedPnl: 50, initialRisk: -Infinity }),
    ]);
    expect(result.rMultiples).toEqual([]);
    expect(result.excluded).toEqual([
      { positionId: "neg-inf-risk", reason: "non-finite" },
    ]);
  });

  it("excludes a non-finite P&L as non-finite", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "inf-pnl", netRealizedPnl: Infinity, initialRisk: 10 }),
    ]);
    expect(result.excluded).toEqual([
      { positionId: "inf-pnl", reason: "non-finite" },
    ]);
  });

  it("excludes a calculated R that overflows to non-finite", () => {
    const result = rMultiplesFromResolvedPositions([
      // Finite inputs, but 1e308 / 1e-5 overflows to Infinity.
      pos({ positionId: "overflow", netRealizedPnl: 1e308, initialRisk: 1e-5 }),
    ]);
    expect(result.rMultiples).toEqual([]);
    expect(result.excluded).toEqual([
      { positionId: "overflow", reason: "non-finite" },
    ]);
  });
});

describe("rMultiplesFromResolvedPositions — exclusion precedence", () => {
  // Documented order (first failing check wins; exactly one reason each):
  // unresolved -> missing-timestamp -> after-cutoff -> non-finite(risk)
  // -> non-positive-risk -> non-finite(P&L) -> non-finite(R).

  it("unresolved beats every later check", () => {
    const result = rMultiplesFromResolvedPositions(
      [
        pos({
          positionId: "multi",
          resolved: false,
          resolutionTimestamp: 5000, // would be after-cutoff
          initialRisk: 0, // would be non-positive-risk
          netRealizedPnl: NaN, // would be non-finite
        }),
      ],
      { cutoff: 1000 },
    );
    expect(result.excluded).toEqual([{ positionId: "multi", reason: "unresolved" }]);
  });

  it("missing-timestamp beats non-positive-risk and non-finite values", () => {
    const result = rMultiplesFromResolvedPositions(
      [pos({ positionId: "multi", resolutionTimestamp: null, initialRisk: 0, netRealizedPnl: NaN })],
      { cutoff: 1000 },
    );
    expect(result.excluded).toEqual([{ positionId: "multi", reason: "missing-timestamp" }]);
  });

  it("after-cutoff beats non-finite risk", () => {
    const result = rMultiplesFromResolvedPositions(
      [pos({ positionId: "multi", resolutionTimestamp: 2000, initialRisk: NaN })],
      { cutoff: 1000 },
    );
    expect(result.excluded).toEqual([{ positionId: "multi", reason: "after-cutoff" }]);
  });

  it("non-finite risk beats non-positive-risk and non-finite P&L", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "multi", initialRisk: Infinity, netRealizedPnl: NaN }),
    ]);
    expect(result.excluded).toEqual([{ positionId: "multi", reason: "non-finite" }]);
  });

  it("non-positive-risk beats a non-finite P&L", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "multi", initialRisk: 0, netRealizedPnl: NaN }),
    ]);
    expect(result.excluded).toEqual([{ positionId: "multi", reason: "non-positive-risk" }]);
  });

  it("assigns exactly one reason per excluded position", () => {
    const result = rMultiplesFromResolvedPositions(
      [pos({ positionId: "multi", resolved: false, initialRisk: NaN, netRealizedPnl: NaN })],
      { cutoff: 1000 },
    );
    expect(result.excluded).toHaveLength(1);
    const total = Object.values(result.excludedCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });
});

describe("rMultiplesFromResolvedPositions — cutoff gating", () => {
  it("includes positions resolved at or before the cutoff and excludes those after", () => {
    const result = rMultiplesFromResolvedPositions(
      [
        pos({ positionId: "before", netRealizedPnl: 60, initialRisk: 40, resolutionTimestamp: 999 }),
        pos({ positionId: "at", netRealizedPnl: 60, initialRisk: 40, resolutionTimestamp: 1000 }),
        pos({ positionId: "after", netRealizedPnl: 60, initialRisk: 40, resolutionTimestamp: 1001 }),
      ],
      { cutoff: 1000 },
    );
    expect(result.included).toBe(2); // before + at (boundary inclusive)
    expect(result.rMultiples).toEqual([1.5, 1.5]);
    expect(result.excluded).toEqual([
      { positionId: "after", reason: "after-cutoff" },
    ]);
  });

  it("excludes a resolved position with a missing timestamp when a cutoff is set", () => {
    const result = rMultiplesFromResolvedPositions(
      [pos({ positionId: "no-ts", netRealizedPnl: 60, initialRisk: 40, resolutionTimestamp: null })],
      { cutoff: 1000 },
    );
    expect(result.excluded).toEqual([
      { positionId: "no-ts", reason: "missing-timestamp" },
    ]);
  });

  it("includes a null-timestamp position when NO cutoff is supplied", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "no-ts", netRealizedPnl: 60, initialRisk: 40, resolutionTimestamp: null }),
    ]);
    expect(result.rMultiples).toEqual([1.5]);
  });
});

describe("rMultiplesFromResolvedPositions — minInitialRisk threshold", () => {
  it("drops dust positions at or below the exclusive threshold and keeps those above", () => {
    const result = rMultiplesFromResolvedPositions(
      [
        pos({ positionId: "at-floor", netRealizedPnl: 2, initialRisk: 1 }),
        pos({ positionId: "above-floor", netRealizedPnl: 2, initialRisk: 2 }),
      ],
      { minInitialRisk: 1 },
    );
    expect(result.rMultiples).toEqual([1]); // only above-floor: 2/2
    expect(result.excluded).toEqual([
      { positionId: "at-floor", reason: "non-positive-risk" },
    ]);
  });
});

describe("rMultiplesFromResolvedPositions — malformed input (throws)", () => {
  it("throws TypeError when positions is not an array", () => {
    // @ts-expect-error intentional bad input
    expect(() => rMultiplesFromResolvedPositions(null)).toThrow(TypeError);
  });

  it("throws TypeError for a non-object element", () => {
    // @ts-expect-error intentional bad input
    expect(() => rMultiplesFromResolvedPositions([null])).toThrow(TypeError);
  });

  it("throws TypeError for a missing/empty positionId", () => {
    expect(() =>
      rMultiplesFromResolvedPositions([pos({ positionId: "" })]),
    ).toThrow(TypeError);
  });

  it("throws TypeError for a non-number netRealizedPnl", () => {
    expect(() =>
      // @ts-expect-error intentional bad input
      rMultiplesFromResolvedPositions([pos({ netRealizedPnl: "60" })]),
    ).toThrow(TypeError);
  });

  it("throws TypeError for a non-boolean resolved", () => {
    expect(() =>
      // @ts-expect-error intentional bad input
      rMultiplesFromResolvedPositions([pos({ resolved: "yes" })]),
    ).toThrow(TypeError);
  });

  it("throws TypeError for a non-number/non-null resolutionTimestamp", () => {
    expect(() =>
      // @ts-expect-error intentional bad input
      rMultiplesFromResolvedPositions([pos({ resolutionTimestamp: "1000" })]),
    ).toThrow(TypeError);
  });

  it("throws RangeError for a non-finite cutoff", () => {
    expect(() =>
      rMultiplesFromResolvedPositions([pos()], { cutoff: NaN }),
    ).toThrow(RangeError);
  });

  it("throws RangeError for a negative minInitialRisk", () => {
    expect(() =>
      rMultiplesFromResolvedPositions([pos()], { minInitialRisk: -1 }),
    ).toThrow(RangeError);
  });
});

describe("rMultiplesFromResolvedPositions — structure & determinism", () => {
  it("returns an empty, fully zero-filled result for an empty input", () => {
    const result = rMultiplesFromResolvedPositions([]);
    expect(result.rMultiples).toEqual([]);
    expect(result.included).toBe(0);
    expect(result.excluded).toEqual([]);
    for (const reason of R_MULTIPLE_EXCLUSION_REASONS) {
      expect(result.excludedCounts[reason]).toBe(0);
    }
  });

  it("always exposes every exclusion reason key, zero-filled", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "a", netRealizedPnl: 60, initialRisk: 40 }),
    ]);
    expect(Object.keys(result.excludedCounts).sort()).toEqual(
      [...R_MULTIPLE_EXCLUSION_REASONS].sort(),
    );
  });

  it("preserves input order among included positions", () => {
    const result = rMultiplesFromResolvedPositions([
      pos({ positionId: "win", netRealizedPnl: 60, initialRisk: 40 }), // 1.5
      pos({ positionId: "open", resolved: false }), // excluded
      pos({ positionId: "loss", netRealizedPnl: -40, initialRisk: 40 }), // -1
      pos({ positionId: "be", netRealizedPnl: 0, initialRisk: 40 }), // 0
    ]);
    expect(result.rMultiples).toEqual([1.5, -1, 0]);
    expect(result.included).toBe(3);
    expect(result.excludedCounts.unresolved).toBe(1);
  });

  it("is deterministic: reordering inputs reorders outputs identically without changing membership", () => {
    const base: ResolvedPosition[] = [
      pos({ positionId: "win", netRealizedPnl: 60, initialRisk: 40 }),
      pos({ positionId: "open", resolved: false }),
      pos({ positionId: "loss", netRealizedPnl: -40, initialRisk: 40 }),
    ];
    const forward = rMultiplesFromResolvedPositions(base);
    const reversed = rMultiplesFromResolvedPositions([...base].reverse());

    expect(forward.rMultiples).toEqual([1.5, -1]);
    expect(reversed.rMultiples).toEqual([-1, 1.5]);
    expect(forward.included).toBe(reversed.included);
    expect(forward.excludedCounts).toEqual(reversed.excludedCounts);
  });

  it("does not mutate the input array or its elements", () => {
    const input = [pos({ positionId: "win", netRealizedPnl: 60, initialRisk: 40 })];
    const snapshot = JSON.parse(JSON.stringify(input));
    rMultiplesFromResolvedPositions(input);
    expect(input).toEqual(snapshot);
  });
});
