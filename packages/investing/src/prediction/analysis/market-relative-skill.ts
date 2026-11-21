/**
 * Market-Relative Skill (MRS) indicator.
 *
 * The Forecaster Trust Score (`./trust-score.ts`) answers "is this trader's P&L
 * consistent?" from R-multiples. It cannot tell whether a forecaster knew
 * anything the market did not: someone who buys every 90c favourite looks
 * skilled on R-multiples and has zero information edge.
 *
 * MRS measures information edge directly. For each resolved forecast, compare
 * the forecaster's probability `p` with the market price `q` that was available
 * when they forecast, against the outcome `o` (1 = YES resolved, 0 = NO):
 *
 *     d = (q - o)^2 - (p - o)^2          // Brier improvement over the market
 *
 * `d > 0` means the forecaster beat the market on that question. Echoing the
 * market scores exactly 0, so passive favourite-following carries no skill.
 *
 * Three safeguards turn the raw mean of `d` into something trustworthy:
 *   1. Recency decay - weights halve every `halfLifeForecasts` forecasts, so a
 *      stale hot streak fades. Only the ORDER of forecasts is used (no clock).
 *   2. Effective sample size - Kish `n_eff = (sum w)^2 / sum w^2` is what the
 *      decayed history is worth, not the raw count.
 *   3. Bayesian shrinkage + lower confidence bound - the mean is pulled toward
 *      zero by `priorStrength` pseudo-observations, and `lowerBound` subtracts
 *      `zScore` standard errors. A forecaster is "skilled" only when even the
 *      pessimistic estimate is positive.
 *
 * Pure and deterministic: no I/O, no clock, no randomness.
 */

export interface ResolvedForecast {
  /** Forecaster's P(YES), in [0, 1]. */
  probability: number;
  /** Market-implied P(YES) when the forecast was made, in [0, 1]. */
  marketPrice: number;
  /** Resolution: 1 if YES, 0 if NO. */
  outcome: 0 | 1;
}

export interface MarketRelativeSkillOptions {
  /** Forecasts after which a forecast's weight halves. Default 50. Infinity disables decay. */
  halfLifeForecasts?: number;
  /** Pseudo-observations of zero skill the mean is shrunk toward. Default 10. */
  priorStrength?: number;
  /** Standard errors subtracted for `lowerBound`. Default 1.645 (one-sided 95%). */
  zScore?: number;
  /** Minimum effective sample size for `reliable`. Default 20. */
  minEffectiveSample?: number;
}

export type MarketRelativeSkillReason =
  | "ok"
  | "empty"
  | "insufficient-sample"
  /** All improvements identical: dispersion (and so the bound) is not estimable. */
  | "zero-variance";

export interface MarketRelativeSkill {
  /** Decay-weighted mean Brier improvement over the market (>0 beats the market). */
  rawSkill: number | null;
  /** `rawSkill` shrunk toward 0 by the prior; the headline indicator. */
  skill: number | null;
  /** `skill` minus `zScore` standard errors. Positive => skill survives pessimism. */
  lowerBound: number | null;
  /** Kish effective sample size of the decayed history. */
  effectiveSample: number;
  sampleSize: number;
  /** Decay-weighted mean Brier of the forecaster / of the market, for context. */
  forecasterBrier: number | null;
  marketBrier: number | null;
  /** `effectiveSample >= minEffectiveSample` and a defined bound. */
  reliable: boolean;
  /** `reliable && lowerBound > 0`: demonstrable edge over the market. */
  skilled: boolean;
  reason: MarketRelativeSkillReason;
}

export const DEFAULT_MRS_OPTIONS = Object.freeze({
  halfLifeForecasts: 50,
  priorStrength: 10,
  zScore: 1.645,
  minEffectiveSample: 20,
});

function unit(name: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1)
    throw new RangeError(`${name} must be a finite number in [0, 1]`);
  return v;
}

/**
 * Computes the Market-Relative Skill of a forecaster.
 *
 * @param forecasts Resolved forecasts in chronological order, oldest first.
 * @throws {TypeError} If `forecasts` is not an array or an outcome is not 0/1.
 * @throws {RangeError} For probabilities outside [0, 1] or invalid options.
 */
export function computeMarketRelativeSkill(
  forecasts: readonly ResolvedForecast[],
  options: MarketRelativeSkillOptions = {},
): MarketRelativeSkill {
  if (!Array.isArray(forecasts))
    throw new TypeError("forecasts must be an array");
  const o = { ...DEFAULT_MRS_OPTIONS, ...options };
  if (!(o.halfLifeForecasts > 0))
    throw new RangeError("halfLifeForecasts must be positive");
  if (!Number.isFinite(o.priorStrength) || o.priorStrength < 0)
    throw new RangeError("priorStrength must be finite and non-negative");
  if (!Number.isFinite(o.zScore) || o.zScore < 0)
    throw new RangeError("zScore must be finite and non-negative");
  if (!(o.minEffectiveSample > 0))
    throw new RangeError("minEffectiveSample must be positive");

  const n = forecasts.length;
  if (n === 0)
    return {
      rawSkill: null, skill: null, lowerBound: null, effectiveSample: 0,
      sampleSize: 0, forecasterBrier: null, marketBrier: null,
      reliable: false, skilled: false, reason: "empty",
    };

  const lambda = Number.isFinite(o.halfLifeForecasts)
    ? Math.LN2 / o.halfLifeForecasts
    : 0;
  let sw = 0, sw2 = 0, sd = 0, sf = 0, sm = 0;
  const w: number[] = [], d: number[] = [];
  forecasts.forEach((f, i) => {
    const p = unit("probability", f?.probability);
    const q = unit("marketPrice", f?.marketPrice);
    if (f.outcome !== 0 && f.outcome !== 1)
      throw new TypeError("outcome must be 0 or 1");
    const wi = Math.exp(-lambda * (n - 1 - i));
    const fb = (p - f.outcome) ** 2, mb = (q - f.outcome) ** 2;
    w.push(wi); d.push(mb - fb);
    sw += wi; sw2 += wi * wi; sd += wi * (mb - fb); sf += wi * fb; sm += wi * mb;
  });

  const effectiveSample = (sw * sw) / sw2;
  const rawSkill = sd / sw;
  const skill = (rawSkill * effectiveSample) / (effectiveSample + o.priorStrength);

  // Weighted variance of d about its mean, with a Kish small-sample correction.
  let sv = 0;
  for (let i = 0; i < n; i++) sv += w[i] * (d[i] - rawSkill) ** 2;
  const variance = effectiveSample > 1
    ? (sv / sw) * (effectiveSample / (effectiveSample - 1))
    : 0;
  const zeroVariance = variance <= 1e-18;
  const se = Math.sqrt(variance / effectiveSample);
  const lowerBound = zeroVariance ? null : skill - o.zScore * se;

  const enough = effectiveSample >= o.minEffectiveSample;
  const reliable = enough && !zeroVariance;
  return {
    rawSkill, skill, lowerBound, effectiveSample, sampleSize: n,
    forecasterBrier: sf / sw, marketBrier: sm / sw,
    reliable,
    skilled: reliable && lowerBound !== null && lowerBound > 0,
    reason: zeroVariance ? "zero-variance" : enough ? "ok" : "insufficient-sample",
  };
}
