/**
 * Polymarket trade-position reconstruction.
 *
 * A pure, deterministic utility that folds stored Polymarket `TRADE` activity
 * rows into completed round-trip positions, producing the {@link ResolvedPosition}
 * records that {@link rMultiplesFromResolvedPositions} (see `./r-multiple.ts`)
 * consumes. It is the bridge between raw persisted trades
 * (`polymarket_trade_history`) and the R-multiple / Trust Score pipeline.
 *
 * WHAT IT DOES
 * - Groups fills by `(traderId, conditionId, outcomeIndex)`.
 * - Within each group, walks fills in timestamp order and tracks inventory,
 *   splitting the history into sequential **open-to-flat episodes**: an episode
 *   opens on the first BUY that lifts inventory off zero and closes when a SELL
 *   returns inventory to zero (within a configurable dust epsilon).
 * - For an episode that cleanly returns to flat it emits a `resolved` position
 *   with `netRealizedPnl = SELL proceeds - BUY cost` and `initialRisk = BUY
 *   cost`, both measured from `usdcSize`; shares are measured from `size`.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * - It does NOT reconstruct positions that were held to market resolution. The
 *   settling REDEEM is not ingested (the sync is `TRADE`-only), so a
 *   held-to-resolution position looks like residual open inventory here and is
 *   left UNRESOLVED. This utility recovers only positions a trader actively
 *   closed by SELLing; it is not a measure of a trader's full track record.
 * - It NEVER consults current market snapshots, `outcomePrices`, `closed`, or
 *   any resolution label to infer a winner or a settlement payout. Doing so
 *   would be look-ahead (those fields are mutable, point-in-time-less snapshots).
 * - It does NOT invent fees or settlement proceeds. Only the cash actually
 *   recorded on TRADE rows (`usdcSize`) is used; whatever the venue folded into
 *   that cash is all we have.
 * - The closure timestamp is the **final closing SELL fill's time**, which is
 *   NOT the market-resolution time. Callers gating on a historical cutoff
 *   should understand this is "when the trader realized the P&L", not "when the
 *   market settled".
 * - It does NOT detect every truncated or incomplete history. A group that is
 *   merely missing its earliest BUYs but never oversells will reconstruct with
 *   an understated cost basis and cannot be distinguished from a complete one.
 *   Only detectable inconsistencies (a SELL exceeding tracked inventory) are
 *   flagged.
 *
 * PURITY: no DB, API, network, or clock access, and the input array and its
 * elements are never mutated. Determinism is relative to input order for fills
 * that share a timestamp (see the tie-break note on {@link reconstructResolvedPositions}).
 */

import type { ResolvedPosition } from "./r-multiple";

/**
 * The subset of a `polymarket_trade_history` row this reconstruction needs.
 * Mirrors the persisted columns (see `db/schema.ts` `polymarketTradeHistory`).
 */
export interface StoredTrade {
  /** Trader wallet address (`trader_id`). */
  traderId: string;
  /** Market condition id (`condition_id`). */
  conditionId: string;
  /** Activity type; only `"TRADE"` rows are reconstructed. */
  type: string;
  /** `"BUY"` or `"SELL"` for a TRADE; other values are treated as missing. */
  side: string | null;
  /** Outcome leg (0 or 1). */
  outcomeIndex: number | null;
  /** Number of shares/tokens in the fill (must be finite and > 0). */
  size: number;
  /** USDC cash moved by the fill (must be finite and >= 0). */
  usdcSize: number;
  /** Trade execution time, epoch seconds (must be finite). */
  timestamp: number;
  /**
   * Optional stable row id (the `transaction_hash-outcomeIndex` primary key).
   * Not used for ordering; carried only to make skip reports traceable.
   */
  id?: string;
}

/** Why a row or group could not be reconstructed into a resolved position. */
export type ReconstructionSkipReason =
  /** Row `type` is not `"TRADE"` (e.g. REDEEM/SPLIT/MERGE); not a bet fill. */
  | "non-trade-type"
  /**
   * A required field was missing or non-finite.
   *
   * For a row whose grouping key is itself usable, the WHOLE group is skipped —
   * including any episodes in that group that had already cleanly opened and
   * closed. This is deliberately more aggressive than the oversell policy, and
   * the reason is that a malformed row is dropped BEFORE its timeline position
   * is recorded, so its true place among the group's fills is unknown. An
   * episode that looks "earlier" among the remaining valid fills might actually
   * have had the malformed fill interleaved inside it, so no episode in the
   * group can be proven to precede the bad row. Discarding the whole group never
   * emits a misleading value; it only drops data we cannot place with certainty.
   * (Contrast `oversold`, whose offending SELL has a known timestamp, so
   * independently completed earlier episodes are retained.)
   *
   * For a row whose grouping key is unusable the single row is skipped (and may
   * silently under-count its group — undetectable here).
   */
  | "missing-fields"
  /**
   * A SELL arrived in an episode that had no recorded BUY inventory. Detected at
   * a known point in the ordered fills, so any independently completed earlier
   * episodes in the same group are retained.
   */
  | "no-buys"
  /**
   * A SELL exceeded the inventory tracked so far (missing earlier BUYs).
   * Detected at a known point in the ordered fills, so any independently
   * completed earlier episodes in the same group are retained; only this
   * episode onward is abandoned.
   */
  | "oversold";

/** One skipped row or group, with the reason and a traceable key. */
export interface ReconstructionSkip {
  /**
   * Group key `traderId:conditionId:outcomeIndex` for group-level skips, or a
   * row locator (`row <id>` / `row #<index>`) for row-level skips.
   */
  key: string;
  reason: ReconstructionSkipReason;
}

/** Result of {@link reconstructResolvedPositions}. */
export interface ReconstructionResult {
  /**
   * Reconstructed positions in deterministic order (grouped, then by episode).
   * Fully SELL-closed episodes have `resolved: true`; a group's trailing
   * residual inventory is emitted once with `resolved: false`. Ready to pass to
   * `rMultiplesFromResolvedPositions`.
   */
  positions: ResolvedPosition[];
  /** Every skipped row/group, in the order encountered. */
  skipped: ReconstructionSkip[];
}

/** Options for {@link reconstructResolvedPositions}. */
export interface ReconstructionOptions {
  /**
   * Absolute tolerance, in shares, for treating residual inventory as flat.
   * Used ONLY to absorb floating-point dust from summing `size`:
   *   - `|inventory| <= sharesEpsilon`  -> treated as exactly flat (episode closes),
   *   - `inventory < -sharesEpsilon`    -> oversell,
   *   - `inventory >  sharesEpsilon`    -> material open inventory (stays unresolved).
   * It never rounds away a material mismatch: anything above the epsilon is
   * real inventory, not dust. Defaults to `1e-9`. Must be finite and >= 0.
   *
   * CAUTION: this is a dust tolerance, not a rounding knob. It is validated only
   * as finite and non-negative — there is no universal upper bound, because the
   * meaningful share scale varies by market. A caller that passes an excessively
   * large value (e.g. tens or hundreds of shares) WILL cause genuinely material
   * residual inventory to be classified as flat, emitting a bogus `resolved`
   * position (and masking a real oversell). Keep it at or near the default;
   * raise it only by an amount provably within float-summation error.
   */
  sharesEpsilon?: number;
}

/** Default dust tolerance for the flat/oversell inventory test. */
export const DEFAULT_SHARES_EPSILON = 1e-9;

function groupKey(
  traderId: string,
  conditionId: string,
  outcomeIndex: number,
): string {
  return `${traderId}:${conditionId}:${outcomeIndex}`;
}

/** A validated TRADE fill, tagged with its original input index for stable sort. */
interface Fill {
  inputIndex: number;
  side: "BUY" | "SELL";
  size: number;
  usdcSize: number;
  timestamp: number;
}

/**
 * Reconstructs completed Polymarket positions from stored TRADE rows.
 *
 * Fills are grouped by `(traderId, conditionId, outcomeIndex)` and, within a
 * group, sorted by `timestamp` ascending. TIE-BREAK: fills sharing a timestamp
 * keep their original input order (a stable sort). Because Polymarket
 * timestamps are second-granularity, several fills in the same second have an
 * ambiguous true execution order; this function does not attempt to recover it,
 * so for same-second fills the episode split (and any oversell classification)
 * depends on the order the caller supplied. Pass rows in a consistent order
 * (e.g. the DB's `ORDER BY timestamp, id`) for reproducible results; the
 * function is otherwise fully deterministic and does not read the clock.
 *
 * @param trades - Stored trade rows (a superset of TRADE rows is fine; non-TRADE
 *   rows are reported as `non-trade-type` skips and ignored).
 * @param options - See {@link ReconstructionOptions}.
 * @returns A {@link ReconstructionResult}.
 * @throws {TypeError} If `trades` is not an array.
 * @throws {RangeError} If `sharesEpsilon` is supplied and is not finite / is negative.
 */
export function reconstructResolvedPositions(
  trades: readonly StoredTrade[],
  options: ReconstructionOptions = {},
): ReconstructionResult {
  if (!Array.isArray(trades))
    throw new TypeError("trades must be an array of StoredTrade");

  const epsilon = options.sharesEpsilon ?? DEFAULT_SHARES_EPSILON;
  if (!Number.isFinite(epsilon) || epsilon < 0)
    throw new RangeError("sharesEpsilon must be a finite, non-negative number");

  const positions: ResolvedPosition[] = [];
  const skipped: ReconstructionSkip[] = [];

  // --- Phase 1: validate & bucket rows into groups, preserving input order.
  // A Map preserves insertion order, so group iteration is deterministic. A
  // group is "poisoned" when it owns a TRADE row with bad value fields: its
  // inventory accounting can no longer be trusted, so it is skipped wholesale.
  const groups = new Map<string, Fill[]>();
  const poisoned = new Set<string>();

  const isNonEmptyString = (v: unknown): v is string =>
    typeof v === "string" && v.length > 0;

  for (let i = 0; i < trades.length; i++) {
    const row = trades[i];
    const locator = isNonEmptyString(row?.id) ? `row ${row.id}` : `row #${i}`;

    if (row === null || typeof row !== "object") {
      skipped.push({ key: locator, reason: "missing-fields" });
      continue;
    }
    if (row.type !== "TRADE") {
      skipped.push({ key: locator, reason: "non-trade-type" });
      continue;
    }

    // Grouping fields must be usable to associate the fill with a group.
    const keyUsable =
      isNonEmptyString(row.traderId) &&
      isNonEmptyString(row.conditionId) &&
      typeof row.outcomeIndex === "number" &&
      Number.isInteger(row.outcomeIndex);

    if (!keyUsable) {
      // Cannot place this row in a group; skip the single row. This can silently
      // under-count its (unknown) group — a limitation we cannot detect.
      skipped.push({ key: locator, reason: "missing-fields" });
      continue;
    }

    const key = groupKey(row.traderId, row.conditionId, row.outcomeIndex);
    // Register the group key on first sighting (in input order), even for a
    // poisoned row, so a group made up entirely of invalid rows is still
    // iterated in phase 2 and reported — not silently dropped.
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = [];
      groups.set(key, bucket);
    }

    // Value fields must be well-formed; otherwise the group's accounting is
    // unreliable and the whole group is poisoned (never partially counted).
    const side = row.side === "BUY" || row.side === "SELL" ? row.side : null;
    const valueFieldsOk =
      side !== null &&
      Number.isFinite(row.size) &&
      row.size > 0 &&
      Number.isFinite(row.usdcSize) &&
      row.usdcSize >= 0 &&
      Number.isFinite(row.timestamp);

    if (!valueFieldsOk) {
      poisoned.add(key);
      continue;
    }

    bucket.push({
      inputIndex: i,
      side,
      size: row.size,
      usdcSize: row.usdcSize,
      timestamp: row.timestamp,
    });
  }

  // --- Phase 2: reconstruct episodes per group.
  for (const [key, fills] of groups) {
    if (poisoned.has(key)) {
      skipped.push({ key, reason: "missing-fields" });
      continue;
    }

    // Stable sort by timestamp; equal timestamps keep input order via inputIndex.
    const ordered = [...fills].sort(
      (a, b) => a.timestamp - b.timestamp || a.inputIndex - b.inputIndex,
    );

    let episodeIndex = 0;
    let shares = 0;
    let cost = 0; // sum of BUY usdcSize in the current episode
    let proceeds = 0; // sum of SELL usdcSize in the current episode
    let hasBuy = false;
    let aborted = false;

    const resetEpisode = () => {
      shares = 0;
      cost = 0;
      proceeds = 0;
      hasBuy = false;
    };

    for (const fill of ordered) {
      if (fill.side === "BUY") {
        shares += fill.size;
        cost += fill.usdcSize;
        hasBuy = true;
        continue;
      }

      // SELL
      shares -= fill.size;
      proceeds += fill.usdcSize;

      if (shares < -epsilon) {
        // Sold more than we hold on record: history is inconsistent/incomplete.
        // Stop this group; do not emit the in-progress (untrustworthy) episode.
        skipped.push({ key, reason: hasBuy ? "oversold" : "no-buys" });
        aborted = true;
        break;
      }

      if (shares <= epsilon) {
        // Flat within dust tolerance: a clean open-to-flat episode closed.
        positions.push({
          positionId: `${key}#${episodeIndex}`,
          netRealizedPnl: proceeds - cost,
          initialRisk: cost,
          resolved: true,
          // Closure = final closing fill time. NOT market-resolution time.
          resolutionTimestamp: fill.timestamp,
        });
        episodeIndex += 1;
        resetEpisode();
      }
      // else: partial scale-out, still long; episode continues.
    }

    if (aborted) continue;

    // Trailing material inventory never returned to flat -> unresolved. Emitted
    // once so the caller sees it; `netRealizedPnl`/`initialRisk` are provisional
    // and ignored downstream because `resolved` is false.
    if (shares > epsilon) {
      positions.push({
        positionId: `${key}#${episodeIndex}`,
        netRealizedPnl: proceeds - cost,
        initialRisk: cost,
        resolved: false,
        resolutionTimestamp: null,
      });
    }
  }

  return { positions, skipped };
}
