/** Adapted from Kalshi-Vibe-Bot backend/src/decision_engine/strategy_{math,gates}.py.
 * MIT, Copyright (c) 2026 K-Jeez. Full notice: THIRD_PARTY_NOTICES.md. */
import type { Outcome, SourceGuard } from '../types'

export const VIBE_LIMITS = {
  minEdgePoints: 5,
  minProbability: 0.6,
  maxEdgePoints: 22,
  maxProbability: 0.9,
  minEntryCents: 26,
  bankrollFraction: 0.05
} as const

export function vibeBuyFailure(
  probabilityYes: number,
  outcome: Outcome,
  priceCents: number
): string | undefined {
  if (
    !Number.isFinite(probabilityYes) ||
    probabilityYes < 0 ||
    probabilityYes > 1 ||
    !['YES', 'NO'].includes(outcome) ||
    !Number.isFinite(priceCents) ||
    priceCents <= 0 ||
    priceCents >= 100
  )
    return 'invalid forecast or entry price'
  const probability = outcome === 'YES' ? probabilityYes : 1 - probabilityYes
  const edge = probability * 100 - priceCents
  if (edge + 1e-9 < VIBE_LIMITS.minEdgePoints) return 'edge below 5 points'
  if (probability + 1e-12 < VIBE_LIMITS.minProbability) return 'buy-side AI probability below 60%'
  if (edge > VIBE_LIMITS.maxEdgePoints + 1e-9) return 'edge exceeds 22 points'
  if (probability > VIBE_LIMITS.maxProbability + 1e-12) return 'buy-side AI probability exceeds 90%'
  if (priceCents < VIBE_LIMITS.minEntryCents) return 'entry below 26 cents'
  if (probability >= 0.75 && priceCents >= 41 && priceCents <= 65)
    return 'calibration block: AI at least 75% on 41–65 cent entry'
}

/** Full Kelly stake / premium, capped to 5% cash when that funds one contract.
 * Upstream retains a one-contract retry when positive Kelly floors to zero. */
export function vibeKellyQuantity(
  cashCents: number,
  probabilityYes: number,
  outcome: Outcome,
  priceCents: number
): number {
  if (
    !Number.isSafeInteger(cashCents) ||
    cashCents <= 0 ||
    !Number.isFinite(probabilityYes) ||
    probabilityYes < 0 ||
    probabilityYes > 1 ||
    !['YES', 'NO'].includes(outcome) ||
    !Number.isFinite(priceCents) ||
    priceCents <= 0 ||
    priceCents >= 100
  )
    return 0
  const probability = outcome === 'YES' ? probabilityYes : 1 - probabilityYes
  const price = priceCents / 100
  const fraction = Math.max(0, Math.min(1, (probability - price) / (1 - price)))
  if (fraction <= 1e-12) return 0
  const cashCap = Math.floor(cashCents / priceCents + 1e-12)
  const percentCap = Math.floor((cashCents * VIBE_LIMITS.bankrollFraction) / priceCents + 1e-12)
  const cap = percentCap >= 1 ? Math.min(percentCap, cashCap) : cashCap
  const fullKelly = Math.floor((fraction * cashCents) / priceCents + 1e-12)
  return Math.min(cap, Math.max(1, fullKelly))
}

export const kalshiVibeGuard: SourceGuard = (proposal, context, signal) => {
  if (proposal.action === 'SELL') return {}
  if (
    signal.probability === undefined ||
    !proposal.outcome ||
    proposal.limitPriceCents === undefined
  )
    return { deny: 'Vibe requires a genuine P(YES) forecast and entry quote' }
  const deny = vibeBuyFailure(signal.probability, proposal.outcome, proposal.limitPriceCents)
  if (deny) return { deny }
  const account = context.account
  if (
    !account ||
    account.kind !== 'event' ||
    proposal.instrument.type !== 'event' ||
    account.venue !== proposal.instrument.venue
  )
    return { deny: 'Vibe requires its current event account' }
  return {
    maxQuantity: vibeKellyQuantity(
      account.portfolio.cashCents,
      signal.probability,
      proposal.outcome,
      proposal.limitPriceCents
    )
  }
}
