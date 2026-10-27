/**
 * TRUST inputs for one Polymarket proxy wallet.
 *
 * This adapter measures SELL-closed-only wallet performance. It does not claim
 * to represent a complete forecaster history: local activity synchronization
 * may be incomplete, and positions held through market resolution stay open
 * because this module never infers outcomes from mutable market snapshots.
 */

import { getTraderTradesThroughCutoff } from "../db/trade-history";
import {
  rMultiplesFromResolvedPositions,
  type ExcludedPosition,
  type RMultipleExclusionReason,
} from "./r-multiple";
import {
  settleResolvedPositions,
  type SettledPosition,
} from "./position-settlement";
import type {
  ReconstructionSkip,
  StoredTrade,
} from "./position-reconstruction";
import {
  computeForecasterTrustScore,
  type ForecasterTrustScore,
  type ForecasterTrustScoreOptions,
} from "./trust-score";

/** The database-shaped fields required by the pure wallet-history adapter. */
export interface StoredWalletTradeRow {
  id: string;
  traderId: string;
  conditionId: string;
  type: string;
  side: string | null;
  outcomeIndex: number | null;
  size: number;
  usdcSize: number;
  /** Drizzle `integer(..., { mode: "timestamp" })` returns a Date. */
  timestamp: Date;
}

export interface PolymarketWalletTrustOptions
  extends ForecasterTrustScoreOptions {
  /** Passed to the existing R-multiple converter. Defaults to zero. */
  minInitialRisk?: number;
}

export interface PolymarketWalletTrustInputs {
  wallet: {
    kind: "polymarket-proxy-wallet";
    id: string;
  };
  /** Inclusive historical cutoff, in epoch seconds. */
  cutoff: number;
  /** Explicitly prevents this partial record from being presented as complete. */
  coverage: {
    basis: "sell-closed-only";
    historyCompleteness: "unknown";
    resolutionEvidence: "none";
  };
  /** SELL-closed and unresolved residual episodes produced by settlement. */
  positions: SettledPosition[];
  /** Rows/groups rejected by conservative reconstruction validation. */
  reconstructionSkips: ReconstructionSkip[];
  /** Finite R-multiples from SELL-closed positions only. */
  rMultiples: number[];
  includedPositions: number;
  rMultipleExclusions: ExcludedPosition[];
  rMultipleExclusionCounts: Record<RMultipleExclusionReason, number>;
  trust: ForecasterTrustScore;
}

function validateIdentityAndCutoff(walletId: string, cutoff: number): void {
  if (typeof walletId !== "string" || walletId.length === 0)
    throw new TypeError("walletId must be a non-empty Polymarket proxy wallet");
  if (!Number.isFinite(cutoff))
    throw new RangeError("cutoff must be a finite epoch-seconds number");
}

/**
 * Purely converts stored wallet rows into R-multiples and a TRUST result.
 *
 * Raw rows are cutoff-filtered before settlement. A valid future row therefore
 * cannot close, oversell, or poison an episode as it existed at the cutoff.
 * Invalid numeric fields are passed through unchanged and are conservatively
 * reported by settlement; this adapter never coerces them to zero.
 */
export function buildPolymarketWalletTrustInputs(
  walletId: string,
  cutoff: number,
  rows: readonly StoredWalletTradeRow[],
  options: PolymarketWalletTrustOptions = {},
): PolymarketWalletTrustInputs {
  validateIdentityAndCutoff(walletId, cutoff);
  if (!Array.isArray(rows))
    throw new TypeError("rows must be an array of stored wallet trades");

  const filtered: StoredTrade[] = [];

  for (const row of rows) {
    if (row.traderId !== walletId)
      throw new TypeError("every trade row must belong to the requested wallet");

    // Drizzle timestamp-mode integers are Dates. Convert explicitly rather than
    // relying on Date/number coercion, and retain NaN for conservative rejection.
    const timestamp =
      row.timestamp instanceof Date ? row.timestamp.getTime() / 1000 : Number.NaN;

    // Only a known-valid timestamp can be classified as future. An invalid Date
    // stays in the input so settlement reports/poisons it as missing-fields.
    if (Number.isFinite(timestamp) && timestamp > cutoff) continue;

    filtered.push({
      id: row.id,
      traderId: row.traderId,
      conditionId: row.conditionId,
      type: row.type,
      side: row.side,
      outcomeIndex: row.outcomeIndex,
      size: row.size,
      usdcSize: row.usdcSize,
      timestamp,
    });
  }

  // No resolution labels are available in the repository. The empty map keeps
  // residual inventory unresolved while preserving Day 4's binary validation
  // and verified-ID de-duplication for SELL-closed episodes.
  const settlement = settleResolvedPositions(filtered, new Map());
  const conversion = rMultiplesFromResolvedPositions(settlement.positions, {
    cutoff,
    minInitialRisk: options.minInitialRisk,
  });
  const trust = computeForecasterTrustScore(conversion.rMultiples, {
    minSampleSize: options.minSampleSize,
    ddof: options.ddof,
  });

  return {
    wallet: { kind: "polymarket-proxy-wallet", id: walletId },
    cutoff,
    coverage: {
      basis: "sell-closed-only",
      historyCompleteness: "unknown",
      resolutionEvidence: "none",
    },
    positions: settlement.positions,
    reconstructionSkips: settlement.skipped,
    rMultiples: conversion.rMultiples,
    includedPositions: conversion.included,
    rMultipleExclusions: conversion.excluded,
    rMultipleExclusionCounts: conversion.excludedCounts,
    trust,
  };
}

/**
 * Loads all locally stored TRADE rows for a wallet through `cutoff`, then runs
 * the pure SELL-closed-only adapter. Local-table completeness remains unknown.
 */
export async function loadPolymarketWalletTrustInputs(
  walletId: string,
  cutoff: number,
  options: PolymarketWalletTrustOptions = {},
): Promise<PolymarketWalletTrustInputs> {
  validateIdentityAndCutoff(walletId, cutoff);
  const cutoffDate = new Date(cutoff * 1000);
  if (!Number.isFinite(cutoffDate.getTime()))
    throw new RangeError("cutoff is outside the supported Date range");

  const rows = await getTraderTradesThroughCutoff(walletId, cutoffDate);
  return buildPolymarketWalletTrustInputs(walletId, cutoff, rows, options);
}
