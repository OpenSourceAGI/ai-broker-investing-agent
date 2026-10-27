/**
 * Polymarket settlement / resolution converter.
 *
 * A pure, deterministic utility that completes the position lifecycle the
 * reconstruction step leaves open. {@link reconstructResolvedPositions} (see
 * `./position-reconstruction.ts`) recovers positions a trader actively SELL-
 * closed and leaves anything held past the last fill as residual open
 * inventory. This converter additionally **settles** that residual inventory at
 * market resolution — but only against an explicit, caller-supplied resolution
 * label, never by reading any market snapshot.
 *
 * It is self-contained by design: it re-derives position accounting from the
 * same stored `TRADE` fills (it does NOT modify or depend on reconstruction's
 * output contract, which cannot express residual share counts) and mirrors
 * reconstruction's grouping, ordering, episode-splitting, and
 * poison/oversell/no-buys semantics exactly, so a SELL-closed episode produces
 * the same numbers here as there. The only additions are (1) de-duplication by
 * the verified trade identity and (2) settlement of the trailing residual.
 *
 * LIFECYCLE OUTPUT — each emitted {@link SettledPosition} is tagged `closure`:
 *   - `"sell-close"`  — an open-to-flat episode closed by SELLs; `resolutionTimestamp`
 *                       is the final closing fill's time (when the trader realized P&L).
 *   - `"settlement"`  — residual inventory settled at market resolution;
 *                       `resolutionTimestamp` is the resolution label's `resolvedAt`
 *                       (true market-settlement time, a DIFFERENT instant from a
 *                       SELL-close time).
 *   - `"open"`        — residual inventory with no (valid) resolution label; left
 *                       UNRESOLVED exactly as reconstruction would.
 *
 * WHAT IT NEVER DOES
 * - Never consults current market snapshots, `outcomePrices`, `closed`, or any
 *   implicit signal to infer a winner or a settlement time. The winning outcome
 *   and resolution timestamp are explicit inputs; absent or invalid, the
 *   position stays unresolved. This keeps historical-cutoff use leak-free.
 * - Never invents fees or settlement events: only recorded `usdcSize` cash and
 *   the explicit binary $1/share payout are used.
 *
 * `SettledPosition` structurally IS a {@link ResolvedPosition} (it only adds
 * fields), so the array feeds straight into `rMultiplesFromResolvedPositions`.
 *
 * PURITY: no DB, API, network, or clock access; inputs are never mutated.
 */

import type { ResolvedPosition } from "./r-multiple";
import {
  DEFAULT_SHARES_EPSILON,
  type ReconstructionSkip,
  type StoredTrade,
} from "./position-reconstruction";

/**
 * An explicit, point-in-time market resolution label for one condition. Supplied
 * by the (impure) caller; this module never derives it from market state.
 */
export interface MarketResolution {
  /**
   * Index of the outcome leg that resolved true. This is a BINARY-market
   * converter, so only `0` or `1` is accepted; any other value (a sentinel,
   * a multi-outcome index, a garbage label) is rejected and the affected
   * position is left unresolved rather than settled or marked a false loss.
   */
  winningOutcomeIndex: number;
  /**
   * Epoch seconds at which the market resolved (the settlement instant). Must be
   * at or after every fill of the settled episode — a market cannot resolve
   * before its last contributing trade. A `resolvedAt` earlier than that leaves
   * the position unresolved (never settled with an impossible, look-ahead time).
   */
  resolvedAt: number;
}

/** How a {@link SettledPosition} reached its final state. */
export type PositionClosure = "sell-close" | "settlement" | "open";

/**
 * A reconstructed position, tagged with how it closed. Adds fields to
 * {@link ResolvedPosition} (so it remains assignable to it and usable directly
 * with `rMultiplesFromResolvedPositions`) without changing that contract.
 */
export interface SettledPosition extends ResolvedPosition {
  /** Whether this was SELL-closed, settled at resolution, or still open. */
  closure: PositionClosure;
  /**
   * Residual shares at resolution — present for `"settlement"` and `"open"`
   * positions, `undefined` for `"sell-close"` (which returned to flat).
   */
  residualShares?: number;
}

/** Result of {@link settleResolvedPositions}. */
export interface SettlementResult {
  /**
   * Positions in deterministic order (grouped, then by episode). Pass directly
   * to `rMultiplesFromResolvedPositions`; `"open"` entries are excluded there
   * as `unresolved`.
   */
  positions: SettledPosition[];
  /** Skipped rows/groups, mirroring reconstruction's reasons. */
  skipped: ReconstructionSkip[];
}

/** A resolution lookup keyed by `conditionId`. */
export type ResolutionMap = ReadonlyMap<string, MarketResolution>;

/** Options for {@link settleResolvedPositions}. */
export interface SettlementOptions {
  /**
   * Dust tolerance in shares for the flat/oversell inventory test. Identical in
   * meaning to reconstruction's option: see its docs for the caution that an
   * excessively large value misclassifies material inventory. Defaults to
   * {@link DEFAULT_SHARES_EPSILON}. Must be finite and >= 0.
   */
  sharesEpsilon?: number;
}

function groupKey(
  traderId: string,
  conditionId: string,
  outcomeIndex: number,
): string {
  return `${traderId}:${conditionId}:${outcomeIndex}`;
}

/** A validated TRADE fill tagged with input index for a stable sort. */
interface Fill {
  inputIndex: number;
  side: "BUY" | "SELL";
  size: number;
  usdcSize: number;
  timestamp: number;
}

/** Per-group accumulator: the fills plus the metadata needed to settle. */
interface Group {
  conditionId: string;
  outcomeIndex: number;
  fills: Fill[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** A binary market has exactly two legs, indexed 0 and 1. */
function isBinaryOutcomeIndex(v: unknown): v is 0 | 1 {
  return v === 0 || v === 1;
}

/**
 * True when a resolution label is structurally usable for a BINARY market.
 * `winningOutcomeIndex` must be exactly 0 or 1 (an out-of-range value is a
 * garbage/sentinel label, not a loss) and `resolvedAt` must be finite. The
 * caller must still check `resolvedAt` against the episode's fills; that
 * temporal rule is applied at the settlement site, not here.
 */
function isValidResolution(r: MarketResolution | undefined): r is MarketResolution {
  return (
    r !== undefined &&
    isBinaryOutcomeIndex(r.winningOutcomeIndex) &&
    Number.isFinite(r.resolvedAt)
  );
}

/**
 * Reconstructs Polymarket positions from stored TRADE fills and settles residual
 * inventory against explicit resolution labels.
 *
 * Fills are grouped by `(traderId, conditionId, outcomeIndex)` and sorted by
 * `timestamp` (stable; equal timestamps keep input order — see
 * {@link reconstructResolvedPositions} for the same tie-break caveat). SELL-
 * closed episodes are emitted as `"sell-close"`. A group's trailing residual
 * inventory is settled as `"settlement"` only when `resolutions` has a label for
 * its `conditionId` that is both (a) a valid BINARY label — `winningOutcomeIndex`
 * exactly 0 or 1, finite `resolvedAt` — and (b) temporally consistent —
 * `resolvedAt` at or after the latest fill of that episode. Otherwise the
 * residual is left `"open"` (unresolved); an unsupported index or an impossible
 * early `resolvedAt` never produces a resolved position or a fabricated $0 loss.
 * A fill whose `outcomeIndex` is not 0 or 1 is rejected as an invalid row
 * (`missing-fields`), not silently grouped. A position is ever only one of these
 * — a closed episode or the trailing residual — so it is never both SELL-closed
 * and settlement-resolved.
 *
 * DE-DUPLICATION: fills are de-duplicated by the verified trade identity — the
 * `id` field, which is the `polymarket_trade_history` primary key
 * `transaction_hash-outcomeIndex`. Two rows sharing a non-empty `id` denote the
 * SAME on-chain fill (the DB enforces uniqueness on it), so only the first is
 * counted and later copies are dropped. Rows WITHOUT an `id` cannot be
 * identified as duplicates and are each counted; de-duplicating those is a
 * caller precondition.
 *
 * @param trades - Stored trade rows (non-TRADE rows are reported as
 *   `non-trade-type` skips and ignored).
 * @param resolutions - Resolution labels keyed by `conditionId`. An empty map
 *   (or a missing/invalid entry) leaves the affected residual positions open.
 * @param options - See {@link SettlementOptions}.
 * @returns A {@link SettlementResult}.
 * @throws {TypeError} If `trades` is not an array or `resolutions` is not a Map.
 * @throws {RangeError} If `sharesEpsilon` is supplied and is not finite / is negative.
 */
export function settleResolvedPositions(
  trades: readonly StoredTrade[],
  resolutions: ResolutionMap,
  options: SettlementOptions = {},
): SettlementResult {
  if (!Array.isArray(trades))
    throw new TypeError("trades must be an array of StoredTrade");
  if (!(resolutions instanceof Map))
    throw new TypeError("resolutions must be a Map keyed by conditionId");

  const epsilon = options.sharesEpsilon ?? DEFAULT_SHARES_EPSILON;
  if (!Number.isFinite(epsilon) || epsilon < 0)
    throw new RangeError("sharesEpsilon must be a finite, non-negative number");

  const positions: SettledPosition[] = [];
  const skipped: ReconstructionSkip[] = [];

  const groups = new Map<string, Group>();
  const poisoned = new Set<string>();
  const seenIds = new Set<string>();

  // --- Phase 1: validate, de-duplicate by trade identity, and bucket.
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

    // De-duplicate by verified identity. A row with an id we have already
    // counted is the same fill; drop it silently (not an error).
    if (isNonEmptyString(row.id)) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
    }

    // Binary-market contract: a usable leg is outcomeIndex 0 or 1. An integer
    // outside {0,1} is a malformed/unsupported index and is treated as an
    // invalid ungroupable row (row-level `missing-fields`), NOT silently grouped
    // and later scored as a $0-payout loss.
    const keyUsable =
      isNonEmptyString(row.traderId) &&
      isNonEmptyString(row.conditionId) &&
      isBinaryOutcomeIndex(row.outcomeIndex);

    if (!keyUsable) {
      skipped.push({ key: locator, reason: "missing-fields" });
      continue;
    }

    const key = groupKey(row.traderId, row.conditionId, row.outcomeIndex);
    let group = groups.get(key);
    if (!group) {
      group = {
        conditionId: row.conditionId,
        outcomeIndex: row.outcomeIndex,
        fills: [],
      };
      groups.set(key, group);
    }

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

    group.fills.push({
      inputIndex: i,
      side,
      size: row.size,
      usdcSize: row.usdcSize,
      timestamp: row.timestamp,
    });
  }

  // --- Phase 2: reconstruct episodes, then settle the residual.
  for (const [key, group] of groups) {
    if (poisoned.has(key)) {
      skipped.push({ key, reason: "missing-fields" });
      continue;
    }

    const ordered = [...group.fills].sort(
      (a, b) => a.timestamp - b.timestamp || a.inputIndex - b.inputIndex,
    );

    let episodeIndex = 0;
    let shares = 0;
    let cost = 0;
    let proceeds = 0;
    let hasBuy = false;
    let aborted = false;
    // Latest fill timestamp among the CURRENT episode's contributing fills. A
    // settlement whose resolvedAt predates this is temporally impossible and is
    // refused (see the residual-settlement block below).
    let episodeMaxTs = Number.NEGATIVE_INFINITY;

    const resetEpisode = () => {
      shares = 0;
      cost = 0;
      proceeds = 0;
      hasBuy = false;
      episodeMaxTs = Number.NEGATIVE_INFINITY;
    };

    for (const fill of ordered) {
      episodeMaxTs = Math.max(episodeMaxTs, fill.timestamp);

      if (fill.side === "BUY") {
        shares += fill.size;
        cost += fill.usdcSize;
        hasBuy = true;
        continue;
      }

      shares -= fill.size;
      proceeds += fill.usdcSize;

      if (shares < -epsilon) {
        skipped.push({ key, reason: hasBuy ? "oversold" : "no-buys" });
        aborted = true;
        break;
      }

      if (shares <= epsilon) {
        positions.push({
          positionId: `${key}#${episodeIndex}`,
          netRealizedPnl: proceeds - cost,
          initialRisk: cost,
          resolved: true,
          resolutionTimestamp: fill.timestamp, // SELL-close time, NOT resolution
          closure: "sell-close",
        });
        episodeIndex += 1;
        resetEpisode();
      }
    }

    if (aborted) continue;
    if (shares <= epsilon) continue; // no residual inventory to settle

    // Trailing residual inventory: settle it against an explicit label, or leave
    // it open. Payout is the binary $1 per winning share. The label is used only
    // when it is valid AND temporally consistent: resolvedAt must be at or after
    // the episode's latest contributing fill (a market cannot resolve before its
    // last trade). An earlier resolvedAt is refused — the position stays open —
    // so a bogus early settlement time can never be included by a downstream
    // cutoff that the fills themselves postdate (no look-ahead).
    const resolution = resolutions.get(group.conditionId);
    if (isValidResolution(resolution) && resolution.resolvedAt >= episodeMaxTs) {
      const payout =
        group.outcomeIndex === resolution.winningOutcomeIndex ? shares * 1 : 0;
      positions.push({
        positionId: `${key}#${episodeIndex}`,
        netRealizedPnl: proceeds + payout - cost,
        initialRisk: cost,
        resolved: true,
        resolutionTimestamp: resolution.resolvedAt, // market-settlement time
        closure: "settlement",
        residualShares: shares,
      });
    } else {
      positions.push({
        positionId: `${key}#${episodeIndex}`,
        netRealizedPnl: proceeds - cost, // provisional; ignored while unresolved
        initialRisk: cost,
        resolved: false,
        resolutionTimestamp: null,
        closure: "open",
        residualShares: shares,
      });
    }
  }

  return { positions, skipped };
}
