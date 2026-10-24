import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_SAMPLE_SIZE,
  computeForecasterTrustScore,
  trustScoreFromMoments,
} from "../src/prediction/analysis/trust-score";

/**
 * Worked example table from the research paper (§3.2, "Example Trust Forecaster
 * Dataset"). Columns: N, meanR (mu_R), stdR (sigma_R), Sharpe, Trust — exactly
 * as printed in the paper.
 *
 * `formulaMatchesTable` records whether the paper's printed `trust` value agrees
 * with its own stated formula `(meanR / stdR) * sqrt(N)` to within TABLE_TOL.
 * P5, P6 and P7 do NOT: their printed Trust disagrees with both the formula and
 * the paper's own Sharpe column (see the dedicated test below). We treat the
 * stated formula — not the typo'd cells — as the specification.
 */
const PAPER_TABLE = [
  { id: "P9", n: 90, meanR: 0.43, stdR: 1.0, sharpe: 0.43, trust: 4.09, formulaMatchesTable: true },
  { id: "P7", n: 120, meanR: 0.37, stdR: 0.8, sharpe: 0.46, trust: 4.0, formulaMatchesTable: false },
  { id: "P2", n: 80, meanR: 0.4, stdR: 1.1, sharpe: 0.36, trust: 3.27, formulaMatchesTable: true },
  { id: "P6", n: 30, meanR: 0.47, stdR: 1.1, sharpe: 0.43, trust: 2.58, formulaMatchesTable: false },
  { id: "P3", n: 25, meanR: 0.44, stdR: 0.9, sharpe: 0.49, trust: 2.47, formulaMatchesTable: true },
  { id: "P1", n: 40, meanR: 0.35, stdR: 1.2, sharpe: 0.29, trust: 1.84, formulaMatchesTable: true },
  { id: "P5", n: 60, meanR: 0.35, stdR: 2.2, sharpe: 0.16, trust: 1.74, formulaMatchesTable: false },
  { id: "P4", n: 100, meanR: 0.26, stdR: 1.6, sharpe: 0.16, trust: 1.63, formulaMatchesTable: true },
  { id: "P8", n: 50, meanR: 0.16, stdR: 1.8, sharpe: 0.09, trust: 0.63, formulaMatchesTable: true },
  { id: "P10", n: 35, meanR: 0.0, stdR: 1.0, sharpe: 0.0, trust: 0.0, formulaMatchesTable: true },
] as const;

/**
 * Tolerance for comparing against the paper's 2-decimal printed values. The
 * inputs (meanR, stdR) are themselves rounded to 2 decimals, so recomputing the
 * score from them and comparing to the paper's 2-decimal Trust compounds two
 * rounding steps; 0.05 comfortably covers that for the consistent rows while
 * still excluding the three transcription errors (which are off by 0.2–1.1).
 */
const TABLE_TOL = 0.05;

describe("trustScoreFromMoments — paper worked examples (§3.2)", () => {
  it.each(PAPER_TABLE)(
    "$id reproduces the stated formula Sharpe*sqrt(N)",
    ({ meanR, stdR, n }) => {
      const score = trustScoreFromMoments(meanR, stdR, n);
      // The contract is the stated formula, recomputed independently here.
      const expected = (meanR / stdR) * Math.sqrt(n);
      expect(score).not.toBeNull();
      expect(score as number).toBeCloseTo(expected, 12);
    },
  );

  it.each(PAPER_TABLE.filter((r) => r.formulaMatchesTable))(
    "$id matches the paper's printed Trust value within tolerance",
    ({ meanR, stdR, n, trust }) => {
      expect(trustScoreFromMoments(meanR, stdR, n) as number).toBeCloseTo(
        trust,
        // toBeCloseTo(x, d) passes when |diff| < 0.5 * 10^-d. We want |diff| <
        // TABLE_TOL (0.05), i.e. d = 1 (|diff| < 0.05).
        1,
      );
    },
  );

  // Explicitly document the three rows where the paper's printed Trust column is
  // internally inconsistent with its own formula and Sharpe column. Our output
  // follows the formula; these assertions pin the size of the paper's error so a
  // future reader does not "fix" the implementation to match the typo.
  it.each(PAPER_TABLE.filter((r) => !r.formulaMatchesTable))(
    "$id: paper's printed Trust conflicts with its stated formula (documented)",
    ({ meanR, stdR, n, sharpe, trust }) => {
      const fromFormula = trustScoreFromMoments(meanR, stdR, n) as number;
      // The inputs and the Sharpe column ARE self-consistent...
      expect(meanR / stdR).toBeCloseTo(sharpe, 2);
      // ...so the printed Trust is what's wrong: it disagrees with the formula.
      expect(Math.abs(fromFormula - trust)).toBeGreaterThan(TABLE_TOL);
    },
  );
});

describe("trustScoreFromMoments — degenerate and invalid inputs", () => {
  it("returns null for zero sample size", () => {
    expect(trustScoreFromMoments(0.5, 1.0, 0)).toBeNull();
  });

  it("returns 0 for zero mean with POSITIVE variance (measured no-edge)", () => {
    expect(trustScoreFromMoments(0, 1.5, 90)).toBe(0);
  });

  it("returns null (not Infinity or 0) for zero dispersion, whatever the mean", () => {
    // All-identical R-multiples: ratio is 0/0 (no info) or x/0 (undefined).
    expect(trustScoreFromMoments(0, 0, 90)).toBeNull();
    expect(trustScoreFromMoments(0.5, 0, 90)).toBeNull();
    expect(trustScoreFromMoments(-0.5, 0, 90)).toBeNull();
  });

  it("produces a negative score for a negative mean", () => {
    expect(trustScoreFromMoments(-0.4, 1.0, 100)).toBeCloseTo(-4.0, 12);
  });

  it("never yields NaN or Infinity, even for extreme magnitudes", () => {
    const score = trustScoreFromMoments(1e308, 1e-308, 100);
    // Overflow collapses to null rather than Infinity.
    expect(score === null || Number.isFinite(score)).toBe(true);
  });

  it("throws on non-finite or malformed arguments", () => {
    expect(() => trustScoreFromMoments(Number.NaN, 1, 10)).toThrow(TypeError);
    expect(() => trustScoreFromMoments(0.1, Number.POSITIVE_INFINITY, 10)).toThrow(TypeError);
    expect(() => trustScoreFromMoments(0.1, 1, 10.5)).toThrow(RangeError);
    expect(() => trustScoreFromMoments(0.1, 1, -1)).toThrow(RangeError);
    expect(() => trustScoreFromMoments(0.1, -1, 10)).toThrow(RangeError);
  });
});

describe("computeForecasterTrustScore — from R-multiples", () => {
  // Fixed reference set: mean 5, population std 2 (ddof 0), sample std sqrt(32/7).
  const SAMPLE = [2, 4, 4, 4, 5, 5, 7, 9];

  it("computes sample-std moments and score by default (ddof 1)", () => {
    const result = computeForecasterTrustScore(SAMPLE);
    expect(result.sampleSize).toBe(8);
    expect(result.meanR).toBeCloseTo(5, 12);
    expect(result.stdR).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(result.sharpe).toBeCloseTo(5 / Math.sqrt(32 / 7), 12);
    expect(result.score as number).toBeCloseTo(
      (5 / Math.sqrt(32 / 7)) * Math.sqrt(8),
      12,
    );
    // 8 < 25: the score IS mathematically defined, but the sample is too small,
    // so it is not reliable. The two axes are reported separately.
    expect(result.isDefined).toBe(true);
    expect(result.hasSufficientSample).toBe(false);
    expect(result.reliable).toBe(false);
    expect(result.reason).toBe("insufficient-sample");
    expect(result.minSampleSize).toBe(DEFAULT_MIN_SAMPLE_SIZE);
  });

  it("uses population std when ddof is 0", () => {
    const result = computeForecasterTrustScore(SAMPLE, { ddof: 0 });
    expect(result.stdR).toBeCloseTo(2, 12);
    expect(result.sharpe).toBeCloseTo(2.5, 12);
    expect(result.score as number).toBeCloseTo(2.5 * Math.sqrt(8), 12);
  });

  it("flags empty input explicitly rather than scoring it", () => {
    const result = computeForecasterTrustScore([]);
    expect(result).toMatchObject({
      score: null,
      isDefined: false,
      hasSufficientSample: false,
      reliable: false,
      sampleSize: 0,
      meanR: 0,
      stdR: 0,
      sharpe: null,
      reason: "empty",
    });
  });

  it("marks a sufficiently long sample reliable", () => {
    // 30 non-constant values above the default threshold of 25.
    const trades = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0.6 : -0.2));
    const result = computeForecasterTrustScore(trades);
    expect(result.sampleSize).toBe(30);
    expect(result.reason).toBe("ok");
    expect(result.isDefined).toBe(true);
    expect(result.hasSufficientSample).toBe(true);
    expect(result.reliable).toBe(true);
    expect(result.score).not.toBeNull();
  });

  it("honours a configurable minimum sample size", () => {
    const trades = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0.6 : -0.2));
    const strict = computeForecasterTrustScore(trades, { minSampleSize: 50 });
    expect(strict.reason).toBe("insufficient-sample");
    // The score is still defined; only the evidence bar moved.
    expect(strict.isDefined).toBe(true);
    expect(strict.hasSufficientSample).toBe(false);
    expect(strict.reliable).toBe(false);
  });

  it("gives an exact score for a reliable, well-sampled history (ddof 0)", () => {
    // [2,4,4,4,5,5,7,9] has mean 5 and population std 2 (ddof 0). Observed 4x
    // (N = 32 >= 25) the population moments are unchanged, so:
    //   score = (5 / 2) * sqrt(32) = 2.5 * sqrt(32) = 10 * sqrt(2).
    const base = [2, 4, 4, 4, 5, 5, 7, 9];
    const result = computeForecasterTrustScore([...base, ...base, ...base, ...base], { ddof: 0 });
    expect(result.sampleSize).toBe(32);
    expect(result.meanR).toBeCloseTo(5, 12);
    expect(result.stdR).toBeCloseTo(2, 12);
    expect(result.sharpe).toBeCloseTo(2.5, 12);
    expect(result.score as number).toBeCloseTo(14.142135623730951, 10); // 10 * sqrt(2)
    expect(result.reason).toBe("ok");
    expect(result.isDefined).toBe(true);
    expect(result.hasSufficientSample).toBe(true);
    expect(result.reliable).toBe(true);
  });

  it("gives an exact score for a reliable history under the DEFAULT sample SD (ddof 1)", () => {
    // 30 trades: 20 at +1R and 10 at -1R. Hand-computed under the default ddof 1:
    //   mean = (20*1 + 10*(-1)) / 30 = 10/30 = 1/3
    //   SS   = 20*(1 - 1/3)^2 + 10*(-1 - 1/3)^2 = 20*(2/3)^2 + 10*(4/3)^2 = 240/9
    //   sample var = SS / (N - 1) = (240/9) / 29 = 240/261   <-- the N-1 pins ddof 1
    //   stdR = sqrt(240/261); sharpe = (1/3)/stdR; score = sharpe * sqrt(30)
    const trades = [
      ...Array.from({ length: 20 }, () => 1),
      ...Array.from({ length: 10 }, () => -1),
    ];
    const result = computeForecasterTrustScore(trades); // default ddof 1
    const meanR = 1 / 3;
    const stdR = Math.sqrt(240 / 261); // divisor 29 would be 30 under ddof 0 -> differs
    const sharpe = meanR / stdR;
    const score = sharpe * Math.sqrt(30);

    expect(result.sampleSize).toBe(30);
    expect(result.meanR).toBeCloseTo(meanR, 12);
    expect(result.stdR).toBeCloseTo(stdR, 12);
    expect(result.sharpe).toBeCloseTo(sharpe, 12);
    expect(result.score as number).toBeCloseTo(score, 12);
    // Concrete literal cross-check, independent of the expressions above.
    expect(result.score as number).toBeCloseTo(1.9039432764659765, 10);
    // ddof is wired consistently: the single stdR feeds both Sharpe and score.
    expect(result.sharpe as number).toBeCloseTo(result.meanR / result.stdR, 12);
    expect(result.score as number).toBeCloseTo(
      (result.sharpe as number) * Math.sqrt(result.sampleSize),
      12,
    );
    // Sanity: the population-SD (ddof 0) score would be a different number.
    expect(result.score as number).not.toBeCloseTo(
      (meanR / Math.sqrt(240 / 270)) * Math.sqrt(30),
      6,
    );
    expect(result.reason).toBe("ok");
    expect(result.reliable).toBe(true);
  });

  it("reports zero mean WITH variance as a reliable no-edge score of 0", () => {
    // 26 alternating +1/-1 -> mean exactly 0, non-zero variance, N >= 25.
    // This is a genuine, well-measured "no edge" result, distinct from the
    // all-zero / no-information case below.
    const trades = Array.from({ length: 26 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    const result = computeForecasterTrustScore(trades);
    expect(result.meanR).toBeCloseTo(0, 12);
    expect(result.score).toBe(0);
    expect(result.reason).toBe("ok");
    expect(result.isDefined).toBe(true);
    expect(result.hasSufficientSample).toBe(true);
    expect(result.reliable).toBe(true);
  });

  it("reports zero variance with a non-zero mean as undefined, not Infinity", () => {
    const trades = Array.from({ length: 30 }, () => 0.5);
    const result = computeForecasterTrustScore(trades);
    expect(result.stdR).toBe(0);
    expect(result.sharpe).toBeNull();
    expect(result.score).toBeNull();
    expect(result.reason).toBe("zero-variance");
    // Enough trades, but the score is undefined -> not reliable.
    expect(result.isDefined).toBe(false);
    expect(result.hasSufficientSample).toBe(true);
    expect(result.reliable).toBe(false);
  });

  it("flags an all-zero history as low-information, not a reliable zero", () => {
    const trades = Array.from({ length: 30 }, () => 0);
    const result = computeForecasterTrustScore(trades);
    expect(result.meanR).toBe(0);
    expect(result.stdR).toBe(0);
    expect(result.sharpe).toBeNull();
    expect(result.score).toBeNull();
    expect(result.reason).toBe("no-information");
    expect(result.isDefined).toBe(false);
    expect(result.hasSufficientSample).toBe(true); // enough trades...
    expect(result.reliable).toBe(false); // ...but nothing to measure
  });

  it("treats a single trade as zero variance (dispersion not estimable)", () => {
    const one = computeForecasterTrustScore([0.5]);
    expect(one.stdR).toBe(0);
    expect(one.score).toBeNull();
    expect(one.reason).toBe("zero-variance");
    // ddof 0 on a singleton still has zero dispersion.
    expect(computeForecasterTrustScore([0.5], { ddof: 0 }).score).toBeNull();
    // A single zero trade is the no-information case, not undefined-ratio.
    expect(computeForecasterTrustScore([0]).reason).toBe("no-information");
  });

  it("handles finite inputs whose sum overflows without NaN/Infinity or throwing", () => {
    const overflowing = [1e308, 1e308];
    let result!: ReturnType<typeof computeForecasterTrustScore>;
    expect(() => {
      result = computeForecasterTrustScore(overflowing);
    }).not.toThrow();
    expect(result.score).toBeNull();
    expect(result.sharpe).toBeNull();
    expect(result.reason).toBe("overflow");
    expect(result.isDefined).toBe(false);
    expect(result.reliable).toBe(false);
  });

  it("throws on non-array input or non-finite elements", () => {
    expect(() => computeForecasterTrustScore(null as unknown as number[])).toThrow(TypeError);
    expect(() => computeForecasterTrustScore([1, Number.NaN])).toThrow(TypeError);
    expect(() => computeForecasterTrustScore([1, Number.POSITIVE_INFINITY])).toThrow(TypeError);
    expect(() => computeForecasterTrustScore(["a"] as unknown as number[])).toThrow(TypeError);
  });

  it("throws on invalid options", () => {
    expect(() => computeForecasterTrustScore([1, 2, 3], { minSampleSize: 0 })).toThrow(RangeError);
    expect(() => computeForecasterTrustScore([1, 2, 3], { minSampleSize: 1.5 })).toThrow(RangeError);
    expect(() => computeForecasterTrustScore([1, 2, 3], { ddof: 2 as 0 | 1 })).toThrow(RangeError);
  });
});

describe("computeForecasterTrustScore — monotonicity in sample size", () => {
  it("strictly increases with N when the moments are held constant", () => {
    const meanR = 0.4;
    const stdR = 1.0;
    const sizes = [25, 50, 100, 200, 400];
    const scores = sizes.map((n) => trustScoreFromMoments(meanR, stdR, n) as number);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
    // sqrt(N) scaling: quadrupling N doubles the score.
    expect(scores[2] / scores[0]).toBeCloseTo(2, 12); // N: 25 -> 100
    expect(scores[4] / scores[2]).toBeCloseTo(2, 12); // N: 100 -> 400
  });

  it("doubles the score when the same distribution is observed 4x as often", () => {
    // Replicating the empirical distribution keeps population moments identical
    // (ddof 0) while multiplying N, so the score scales by sqrt(reps).
    const base = [0.8, -0.3, 0.5, -0.1, 0.2, -0.4];
    const quad = [...base, ...base, ...base, ...base];

    const b = computeForecasterTrustScore(base, { ddof: 0, minSampleSize: 1 });
    const q = computeForecasterTrustScore(quad, { ddof: 0, minSampleSize: 1 });

    expect(q.meanR).toBeCloseTo(b.meanR, 12);
    expect(q.stdR).toBeCloseTo(b.stdR, 12);
    expect(q.sampleSize).toBe(base.length * 4);
    expect((q.score as number) / (b.score as number)).toBeCloseTo(2, 12);
  });
});
