/**
 * Forecaster Trust Score.
 *
 * A pure, deterministic implementation of the "Forecaster Trust Score"
 * described in the AI Broker research paper
 * (`apps/ai-broker-web/content/docs/agents/ai-broker-research-paper.md`, §3.2),
 * which extends the per-trade Sharpe ratio with a sample-size confidence term so
 * that a long, consistent track record is trusted more than a short, lucky one.
 *
 * Stated formula (paper §3.2):
 *
 *     Trust = (meanR / stdR) * sqrt(N)
 *
 * where
 *   - meanR = mean R-multiple per resolved trade (edge per unit of risk),
 *   - stdR  = standard deviation of R-multiples (consistency),
 *   - N     = number of resolved trades (sample size).
 *
 * The leading `meanR / stdR` factor is the per-trade Sharpe ratio; `sqrt(N)` is
 * the standard-error amplification that rewards larger samples. A forecaster
 * with zero mean R-multiple scores zero regardless of N (paper §3.2.3), which is
 * the no-edge baseline that distinguishes skill from luck.
 *
 * This module only computes the score. It deliberately does NOT read trades from
 * a database or API, resolve markets, size positions, or place orders — it is a
 * self-contained numeric function with no network, no clock, and no execution
 * side effects, so it can be unit-tested and reasoned about in isolation.
 *
 * NOTE ON THE PAPER'S WORKED TABLE: the example table in §3.2 (forecasters
 * P1–P10) is internally inconsistent for three rows. P5, P6 and P7 print a
 * `Trust` value that disagrees with the paper's own `Sharpe` column and with the
 * stated formula `Sharpe * sqrt(N)` (e.g. P7: 0.46 * sqrt(120) = 5.07, not the
 * printed 4.00). The other seven rows agree with the formula to within rounding.
 * This implementation follows the stated formula; the test file documents each
 * discrepancy explicitly.
 */

/** Why a score is (or is not) reliable. See {@link ForecasterTrustScore}. */
export type TrustScoreReason =
  /** Score computed and sample size meets the minimum — safe to rely on. */
  | "ok"
  /** No trades supplied; nothing to score. */
  | "empty"
  /** Score computed, but fewer than `minSampleSize` trades — treat as weak. */
  | "insufficient-sample"
  /**
   * R-multiples have zero dispersion while the mean is non-zero, so the
   * Sharpe ratio (and therefore the score) is undefined rather than infinite.
   */
  | "zero-variance"
  /**
   * R-multiples have zero dispersion AND a zero mean (every trade identical,
   * e.g. an all-zero / all-break-even history). There is no edge and no spread
   * to measure, so this carries no information — not a reliable zero.
   */
  | "no-information"
  /**
   * Inputs were individually finite but their sum or dispersion overflowed to
   * a non-finite value, so no finite score exists.
   */
  | "overflow";

/** Options for {@link computeForecasterTrustScore}. */
export interface ForecasterTrustScoreOptions {
  /**
   * Minimum number of resolved trades for a score to be considered reliable.
   * Defaults to 25, matching the `N >= 25` threshold used throughout the paper.
   * A score is still computed below this, but is flagged `reliable: false`.
   */
  minSampleSize?: number;
  /**
   * Delta degrees of freedom for the standard deviation of R-multiples:
   *   - `1` (default): sample standard deviation (divides the sum of squared
   *     deviations by `N - 1`), matching the finance Sharpe-ratio convention the
   *     paper's Sharpe column is built on.
   *   - `0`: population standard deviation (divides by `N`).
   * With a single trade (`N - ddof <= 0`) the dispersion is not estimable and is
   * treated as zero variance.
   */
  ddof?: 0 | 1;
}

/** Result of {@link computeForecasterTrustScore}. */
export interface ForecasterTrustScore {
  /**
   * The Trust Score `(meanR / stdR) * sqrt(N)`, or `null` when it is not finitely
   * defined (no trades, zero dispersion, or overflow). Never `NaN` or `Infinity`.
   */
  score: number | null;
  /**
   * Whether `score` is a finite number — i.e. the formula is mathematically
   * defined for this input. Independent of sample size. Equivalent to
   * `score !== null`.
   */
  isDefined: boolean;
  /**
   * Whether `sampleSize >= minSampleSize` — i.e. there is enough evidence to
   * trust the number. Independent of whether the score is defined.
   */
  hasSufficientSample: boolean;
  /**
   * Safe to act on: `isDefined && hasSufficientSample`. A single flag for the
   * common "should I use this?" check; inspect `isDefined` / `hasSufficientSample`
   * (or `reason`) to see which condition failed.
   */
  reliable: boolean;
  /** Number of resolved trades used (array length). */
  sampleSize: number;
  /** Mean R-multiple. `0` when there are no trades. */
  meanR: number;
  /** Standard deviation of R-multiples under `ddof`. `0` when undefined. */
  stdR: number;
  /** Per-trade Sharpe ratio `meanR / stdR`, or `null` when `stdR` is `0`. */
  sharpe: number | null;
  /** Machine-readable explanation of `score` / `reliable`. */
  reason: TrustScoreReason;
  /** The effective minimum sample size used for the reliability decision. */
  minSampleSize: number;
}

/** Default minimum resolved-trade count for a reliable score (paper: N >= 25). */
export const DEFAULT_MIN_SAMPLE_SIZE = 25;

/**
 * Computes the Trust Score directly from pre-aggregated moments.
 *
 * This is the exact formula `(meanR / stdR) * sqrt(sampleSize)` with safe
 * handling of the degenerate cases, kept separate from
 * {@link computeForecasterTrustScore} so callers that already have summary
 * statistics (for example, the paper's worked table) can use it without
 * reconstructing a per-trade array.
 *
 * @param meanR - Mean R-multiple.
 * @param stdR - Standard deviation of R-multiples (must be `>= 0`).
 * @param sampleSize - Number of resolved trades (non-negative integer).
 * @returns The finite Trust Score, or `null` when it is undefined: no trades
 *   (`sampleSize === 0`) or zero dispersion (`stdR === 0`, including a zero mean
 *   — the t-statistic needs non-zero sample variance). A zero mean with POSITIVE
 *   variance scores `0` (no edge), per the paper. Never `NaN`/`Infinity`.
 * @throws {TypeError} If any argument is not a finite number.
 * @throws {RangeError} If `sampleSize` is negative or non-integer, or `stdR < 0`.
 */
export function trustScoreFromMoments(
  meanR: number,
  stdR: number,
  sampleSize: number,
): number | null {
  if (
    !Number.isFinite(meanR) ||
    !Number.isFinite(stdR) ||
    !Number.isFinite(sampleSize)
  )
    throw new TypeError("trust score moments must be finite numbers");
  if (!Number.isInteger(sampleSize) || sampleSize < 0)
    throw new RangeError("sampleSize must be a non-negative integer");
  if (stdR < 0) throw new RangeError("stdR must be non-negative");

  if (sampleSize === 0) return null;
  // Zero dispersion: the per-trade Sharpe is undefined — a non-zero mean divides
  // by zero (±Infinity) and a zero mean is the indeterminate 0/0. Either way no
  // finite score exists. (A zero mean with POSITIVE variance is the no-edge case
  // and scores 0 via the formula below.)
  if (stdR === 0) return null;

  const score = (meanR / stdR) * Math.sqrt(sampleSize);
  // Guard against overflow from extreme inputs producing a non-finite result.
  return Number.isFinite(score) ? score : null;
}

/**
 * Computes a {@link ForecasterTrustScore} from a forecaster's resolved-trade
 * R-multiples.
 *
 * Each element is one resolved trade's R-multiple (profit or loss expressed in
 * units of the risk taken on that trade). The caller is responsible for turning
 * raw trade history into R-multiples; this function performs no resolution,
 * I/O, or time-dependent work.
 *
 * @param rMultiples - Finite R-multiples, one per resolved trade.
 * @param options - See {@link ForecasterTrustScoreOptions}.
 * @returns A fully populated {@link ForecasterTrustScore}. Insufficient evidence
 *   is reported via `reliable`/`reason`, never hidden behind a bare number.
 * @throws {TypeError} If `rMultiples` is not an array or contains a non-finite
 *   value.
 * @throws {RangeError} If `minSampleSize` is not a positive integer, or `ddof`
 *   is not `0` or `1`.
 */
export function computeForecasterTrustScore(
  rMultiples: readonly number[],
  options: ForecasterTrustScoreOptions = {},
): ForecasterTrustScore {
  if (!Array.isArray(rMultiples))
    throw new TypeError("rMultiples must be an array of numbers");

  const minSampleSize = options.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;
  const ddof = options.ddof ?? 1;
  if (!Number.isInteger(minSampleSize) || minSampleSize < 1)
    throw new RangeError("minSampleSize must be a positive integer");
  if (ddof !== 0 && ddof !== 1)
    throw new RangeError("ddof must be 0 or 1");

  for (const r of rMultiples) {
    if (typeof r !== "number" || !Number.isFinite(r))
      throw new TypeError("rMultiples must contain only finite numbers");
  }

  const sampleSize = rMultiples.length;
  if (sampleSize === 0)
    return {
      score: null,
      isDefined: false,
      hasSufficientSample: false,
      reliable: false,
      sampleSize: 0,
      meanR: 0,
      stdR: 0,
      sharpe: null,
      reason: "empty",
      minSampleSize,
    };

  const meanR = rMultiples.reduce((sum, r) => sum + r, 0) / sampleSize;

  // With a single observation under the sample convention the divisor is zero,
  // so the dispersion is not estimable; report it as zero variance.
  const divisor = sampleSize - ddof;
  let stdR = 0;
  if (divisor > 0) {
    const sumSquaredDeviations = rMultiples.reduce(
      (sum, r) => sum + (r - meanR) ** 2,
      0,
    );
    stdR = Math.sqrt(sumSquaredDeviations / divisor);
  }

  const hasSufficientSample = sampleSize >= minSampleSize;

  // NaN/overflow-safe per-trade Sharpe: defined only for a finite, positive
  // standard deviation.
  let sharpe: number | null = null;
  if (Number.isFinite(meanR) && Number.isFinite(stdR) && stdR > 0) {
    const ratio = meanR / stdR;
    sharpe = Number.isFinite(ratio) ? ratio : null;
  }

  let score: number | null;
  let reason: TrustScoreReason;
  if (!Number.isFinite(meanR) || !Number.isFinite(stdR)) {
    // Inputs were finite but their sum/dispersion overflowed to ±Infinity.
    score = null;
    reason = "overflow";
  } else if (stdR === 0) {
    // Zero dispersion. A zero mean (every trade identical, e.g. all-zero
    // history) carries no information; a non-zero mean leaves the ratio
    // undefined. Neither is a reliable score.
    score = null;
    reason = meanR === 0 ? "no-information" : "zero-variance";
  } else {
    score = trustScoreFromMoments(meanR, stdR, sampleSize);
    // Positive variance but a non-finite score means the magnitude overflowed.
    if (score === null) reason = "overflow";
    else reason = hasSufficientSample ? "ok" : "insufficient-sample";
  }

  const isDefined = score !== null;
  return {
    score,
    isDefined,
    hasSufficientSample,
    reliable: isDefined && hasSufficientSample,
    sampleSize,
    meanR,
    stdR,
    sharpe,
    reason,
    minSampleSize,
  };
}
