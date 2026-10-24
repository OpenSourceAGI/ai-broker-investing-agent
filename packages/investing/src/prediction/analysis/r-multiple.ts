/**
 * R-multiple conversion for resolved prediction-market positions.
 *
 * A pure, deterministic utility that turns a list of already-reconstructed,
 * fully-realized positions into the per-trade R-multiples consumed by
 * {@link computeForecasterTrustScore} (see `./trust-score.ts`). An R-multiple
 * expresses a position's realized profit or loss in units of the risk taken:
 *
 *     R = netRealizedPnl / initialRisk
 *
 * where `initialRisk` is the net premium paid to open the position (the most
 * that can be lost, since a prediction-market share's downside is bounded at
 * zero). A position that loses its entire stake therefore scores exactly -1R,
 * matching the research paper's convention (§3.2).
 *
 * BOUNDARY: this module sits at the clean edge of the pipeline. It performs NO
 * I/O, DB, network, or clock access; it does NOT reconstruct positions from raw
 * trade history, ingest settlement/redemption events, impute resolution
 * outcomes, size positions, or place orders. All of that is upstream, impure
 * work that produces the {@link ResolvedPosition} array this function consumes.
 * A `cutoff` is passed in, never read from the system clock, so the function
 * stays referentially transparent and leak-free: a Trust Score at a historical
 * cutoff must only see outcomes known by that cutoff, and the caller enforces
 * that by supplying the cutoff here.
 *
 * Error philosophy mirrors `trust-score.ts`: malformed INPUT SHAPES throw
 * (programmer error), while DATA-QUALITY problems in otherwise well-formed
 * records (unresolved, non-finite financials, non-positive risk, timestamps
 * after the cutoff) are reported as soft exclusions, never thrown and never
 * silently coerced. Every value in the returned `rMultiples` is a finite
 * number, so the downstream Trust Score never has to defend against NaN/Infinity.
 */

/** Why a {@link ResolvedPosition} was dropped from the R-multiple sample. */
export type RMultipleExclusionReason =
  /** `resolved === false`: the position is still open / not yet realized. */
  | "unresolved"
  /**
   * `initialRisk` is at or below the accepted floor (`<= minInitialRisk`,
   * default `0`). Includes the zero-risk divide-by-zero case; no R is emitted
   * rather than an infinite one.
   */
  | "non-positive-risk"
  /**
   * `netRealizedPnl` or `initialRisk` is not a finite number, or the computed
   * R-multiple overflowed to a non-finite value.
   */
  | "non-finite"
  /**
   * A `cutoff` was supplied but the position's `resolutionTimestamp` is `null`
   * or non-finite, so it cannot be placed relative to the cutoff.
   */
  | "missing-timestamp"
  /**
   * A `cutoff` was supplied and `resolutionTimestamp > cutoff`: the outcome was
   * not known by the cutoff, so including it would leak future information.
   */
  | "after-cutoff";

/** Every exclusion reason, in a fixed order, for zero-filling tallies. */
export const R_MULTIPLE_EXCLUSION_REASONS: readonly RMultipleExclusionReason[] = [
  "unresolved",
  "non-positive-risk",
  "non-finite",
  "missing-timestamp",
  "after-cutoff",
];

/**
 * One completed (fully realized) prediction-market position, already netted by
 * the upstream impure adapter. The YES/NO distinction does not appear here: it
 * is folded into the signed `netRealizedPnl` and the `initialRisk` before this
 * function sees it.
 */
export interface ResolvedPosition {
  /** Stable identifier, e.g. `${trader}:${conditionId}:${outcomeIndex}`. */
  positionId: string;
  /**
   * Net realized profit or loss in USDC: sale proceeds + settlement redemptions
   * minus entry cost minus fees. May be negative, or exactly `0` (break-even).
   */
  netRealizedPnl: number;
  /**
   * Initial risk in USDC: the net premium paid to open the position. Must be
   * strictly positive (and above `minInitialRisk`) to be usable as the R
   * denominator.
   */
  initialRisk: number;
  /**
   * Whether the position's P&L is fully realized — either the market settled at
   * resolution or the position was fully exited early. Open positions
   * (`false`) are never scored.
   */
  resolved: boolean;
  /**
   * Epoch seconds at which the realized P&L became known (settlement time, or
   * the final exit trade's time). Required (finite) for cutoff gating; `null`
   * when the position is unresolved or the time is unknown.
   */
  resolutionTimestamp: number | null;
}

/** A single dropped position and the reason it was dropped. */
export interface ExcludedPosition {
  positionId: string;
  /** The reason; never the implicit "included" state. */
  reason: RMultipleExclusionReason;
}

/** Options for {@link rMultiplesFromResolvedPositions}. */
export interface RMultipleOptions {
  /**
   * Historical cutoff in epoch seconds. When supplied, only positions whose
   * `resolutionTimestamp` is finite and `<= cutoff` are included; the rest are
   * excluded as `after-cutoff` or `missing-timestamp`. Omitted means no gate.
   */
  cutoff?: number;
  /**
   * Exclusive lower bound on `initialRisk` (USDC). A position is usable only
   * when `initialRisk > minInitialRisk`. Defaults to `0`, so any strictly
   * positive risk is accepted. Must be a finite, non-negative number.
   */
  minInitialRisk?: number;
}

/** Result of {@link rMultiplesFromResolvedPositions}. */
export interface RMultipleConversion {
  /**
   * Finite R-multiples for the included positions, in the order they appeared
   * in the input. Ready to pass straight to `computeForecasterTrustScore`.
   */
  rMultiples: number[];
  /** Number of included positions; always equals `rMultiples.length`. */
  included: number;
  /** One entry per dropped position, in input order, with its reason. */
  excluded: ExcludedPosition[];
  /**
   * Count of exclusions per reason. Every {@link RMultipleExclusionReason} key
   * is present and zero-filled, so callers can read any reason without a guard.
   */
  excludedCounts: Record<RMultipleExclusionReason, number>;
}

/** Builds a zero-filled tally keyed by every exclusion reason. */
function emptyExcludedCounts(): Record<RMultipleExclusionReason, number> {
  const counts = {} as Record<RMultipleExclusionReason, number>;
  for (const reason of R_MULTIPLE_EXCLUSION_REASONS) counts[reason] = 0;
  return counts;
}

/**
 * Converts resolved prediction-market positions into per-position R-multiples,
 * reporting every position that is dropped and why.
 *
 * Soft exclusions are evaluated in a fixed precedence; the first failing check
 * wins, so each dropped position carries exactly one reason:
 *   1. `unresolved`         — `resolved === false`.
 *   2. `missing-timestamp`  — a `cutoff` is set but `resolutionTimestamp` is
 *                             `null`/non-finite.
 *   3. `after-cutoff`       — a `cutoff` is set and `resolutionTimestamp > cutoff`.
 *   4. `non-finite` (risk)  — `initialRisk` is NaN or ±Infinity (checked before
 *                             the threshold, so `+Infinity` cannot slip through).
 *   5. `non-positive-risk`  — finite `initialRisk <= minInitialRisk`.
 *   6. `non-finite` (P&L)   — `netRealizedPnl` is NaN or ±Infinity.
 *   7. `non-finite` (R)     — the finite division overflowed to a non-finite R.
 *
 * @param positions - Completed positions produced by the upstream adapter.
 * @param options - See {@link RMultipleOptions}.
 * @returns A {@link RMultipleConversion}: the finite R-multiples (input order),
 *   the included count, the excluded positions with reasons, and a zero-filled
 *   per-reason tally.
 * @throws {TypeError} If `positions` is not an array, or any element is not a
 *   well-formed {@link ResolvedPosition} (missing/ wrong-typed `positionId`,
 *   `netRealizedPnl`, `initialRisk`, `resolved`, or `resolutionTimestamp`).
 * @throws {RangeError} If `cutoff` is supplied and is not finite, or
 *   `minInitialRisk` is supplied and is not a finite, non-negative number.
 */
export function rMultiplesFromResolvedPositions(
  positions: readonly ResolvedPosition[],
  options: RMultipleOptions = {},
): RMultipleConversion {
  if (!Array.isArray(positions))
    throw new TypeError("positions must be an array of ResolvedPosition");

  // Validate options up front: a bad cutoff or threshold is a programmer error.
  const hasCutoff = options.cutoff !== undefined;
  if (hasCutoff && !Number.isFinite(options.cutoff))
    throw new RangeError("cutoff must be a finite number when provided");
  const cutoff = options.cutoff as number;

  const minInitialRisk = options.minInitialRisk ?? 0;
  if (!Number.isFinite(minInitialRisk) || minInitialRisk < 0)
    throw new RangeError("minInitialRisk must be a finite, non-negative number");

  const rMultiples: number[] = [];
  const excluded: ExcludedPosition[] = [];
  const excludedCounts = emptyExcludedCounts();

  const drop = (positionId: string, reason: RMultipleExclusionReason): void => {
    excluded.push({ positionId, reason });
    excludedCounts[reason] += 1;
  };

  for (const position of positions) {
    // --- Shape validation (programmer error -> throw) --------------------
    if (position === null || typeof position !== "object")
      throw new TypeError("each position must be a ResolvedPosition object");
    if (
      typeof position.positionId !== "string" ||
      position.positionId.length === 0
    )
      throw new TypeError("position.positionId must be a non-empty string");
    if (typeof position.netRealizedPnl !== "number")
      throw new TypeError("position.netRealizedPnl must be a number");
    if (typeof position.initialRisk !== "number")
      throw new TypeError("position.initialRisk must be a number");
    if (typeof position.resolved !== "boolean")
      throw new TypeError("position.resolved must be a boolean");
    if (
      position.resolutionTimestamp !== null &&
      typeof position.resolutionTimestamp !== "number"
    )
      throw new TypeError(
        "position.resolutionTimestamp must be a number or null",
      );

    const { positionId, netRealizedPnl, initialRisk, resolutionTimestamp } =
      position;

    // --- Soft exclusions (data quality -> report, never throw) -----------
    // Order matters; the first failing check wins, so each position carries
    // exactly one reason. Precedence (see the function docstring):
    //   unresolved -> missing-timestamp -> after-cutoff -> non-finite (risk)
    //   -> non-positive-risk -> non-finite (P&L) -> non-finite (R overflow).
    if (!position.resolved) {
      drop(positionId, "unresolved");
      continue;
    }
    if (hasCutoff) {
      if (
        resolutionTimestamp === null ||
        !Number.isFinite(resolutionTimestamp)
      ) {
        drop(positionId, "missing-timestamp");
        continue;
      }
      if (resolutionTimestamp > cutoff) {
        drop(positionId, "after-cutoff");
        continue;
      }
    }
    // A non-finite risk is never a valid denominator. This must be checked
    // BEFORE the threshold comparison: `+Infinity > minInitialRisk` is true, so
    // a positive-Infinity risk would otherwise slip through and divide a finite
    // P&L to a spurious 0R. NaN and -Infinity fail the comparison but are
    // reported here as `non-finite` rather than `non-positive-risk`.
    if (!Number.isFinite(initialRisk)) {
      drop(positionId, "non-finite");
      continue;
    }
    // Non-positive / below-threshold risk cannot be a valid R denominator.
    if (!(initialRisk > minInitialRisk)) {
      drop(positionId, "non-positive-risk");
      continue;
    }
    if (!Number.isFinite(netRealizedPnl)) {
      drop(positionId, "non-finite");
      continue;
    }

    const r = netRealizedPnl / initialRisk;
    // Guard against overflow from extreme finite inputs (e.g. a huge P&L over a
    // tiny risk) producing a non-finite R.
    if (!Number.isFinite(r)) {
      drop(positionId, "non-finite");
      continue;
    }

    rMultiples.push(r);
  }

  return {
    rMultiples,
    included: rMultiples.length,
    excluded,
    excludedCounts,
  };
}
