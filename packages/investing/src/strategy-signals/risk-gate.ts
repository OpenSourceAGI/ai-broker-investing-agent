import type {
  NormalizedSignal,
  ProposalContext,
  RiskLimits,
  RiskPosture,
  RiskVerdict,
  StrategySource,
  TradeProposal
} from './types'
import { heldQuantity } from './proposal'
import { affordableQuantity, takerFeeCents } from './fees'
import {
  isQuantity,
  isUtcTime,
  validateAccount,
  validateInstrument,
  validateLimits,
  validatePosture
} from './validate'

export function applyRiskGate(
  proposal: TradeProposal,
  context: ProposalContext,
  limits: RiskLimits,
  posture: RiskPosture,
  source?: Pick<StrategySource<any>, 'id' | 'guards'>,
  signal?: NormalizedSignal
): RiskVerdict {
  const reasons = [
    ...validateLimits(limits),
    ...validatePosture(posture),
    ...validateAccount(context.account),
    ...validateInstrument(proposal.instrument)
  ]
  const deny = (reason: string): RiskVerdict => ({
    allowed: false,
    maxQuantity: 0,
    reasons: [...reasons, reason],
    limits
  })
  if (reasons.length) return deny('invalid risk configuration or account')
  if (
    !isQuantity(proposal.quantity) ||
    !isUtcTime(proposal.asOf) ||
    !isUtcTime(context.evaluationTime) ||
    Date.parse(proposal.asOf) > Date.parse(context.evaluationTime) ||
    !['BUY', 'SELL'].includes(proposal.action)
  )
    return deny('invalid proposal')
  const a = context.account!,
    i = proposal.instrument
  if (
    (i.type === 'event' && (a.kind !== 'event' || a.venue !== i.venue || !proposal.outcome)) ||
    (i.type === 'equity' && a.kind !== 'equity')
  )
    return deny('account scope mismatch')
  const held = heldQuantity({ ...context, instrument: i }, proposal.outcome)
  if (proposal.action === 'SELL') {
    const maxQuantity = Math.min(held, proposal.quantity)
    return {
      allowed: maxQuantity > 0,
      maxQuantity,
      reasons: maxQuantity > 0 ? ['exit limited to actual holdings'] : ['no holdings to sell'],
      limits
    }
  }
  if (!posture.allowNewEntries) return deny('new entries blocked by posture')
  if (i.type === 'event' && limits.maxQuoteAgeMs !== undefined) {
    const quotedAt = context.event?.quotedAt
    const age = Date.parse(context.evaluationTime) - Date.parse(quotedAt ?? '')
    if (!isUtcTime(quotedAt) || !(age >= 0 && age <= limits.maxQuoteAgeMs))
      return deny('stale or missing quote')
  }
  const price = proposal.limitPriceCents
  if (
    (price !== undefined &&
      (!Number.isFinite(price) || price <= 0 || (i.type === 'event' && price > 100))) ||
    (i.type === 'event' && price === undefined)
  )
    return deny('invalid entry price')
  const cash = a.kind === 'event' ? a.portfolio.cashCents : a.cashCents
  const positions =
    a.kind === 'event' ? Object.values(a.portfolio.positions) : Object.values(a.shares)
  if (
    !held &&
    limits.maxOpenPositions !== undefined &&
    positions.filter(p => p.quantity > 0).length >= limits.maxOpenPositions
  )
    return deny('open-position limit')
  const feeBps = i.type === 'event' ? (limits.takerFeeBps ?? 0) : 0
  let maxQuantity = Math.floor(
    Math.min(
      proposal.quantity,
      Math.max(0, limits.maxPositionPerMarket - held),
      price === undefined ? Number.MAX_SAFE_INTEGER : affordableQuantity(cash, price, feeBps)
    ) * posture.sizeMultiplier
  )
  reasons.push('current cash, position cap and posture applied')
  if (source?.guards?.length) {
    if (source.id !== proposal.sourceId || !signal || signal.sourceId !== source.id)
      return deny('source guard identity missing')
    for (const guard of source.guards) {
      try {
        const result = guard(proposal, context, signal)
        if (result.deny) return deny(result.deny)
        if (result.maxQuantity !== undefined) {
          if (!isQuantity(result.maxQuantity)) return deny('invalid source cap')
          maxQuantity = Math.min(maxQuantity, result.maxQuantity)
          reasons.push(`source cap ${result.maxQuantity}`)
        }
      } catch {
        return deny('source guard error')
      }
    }
  }
  if (
    i.type === 'event' &&
    (limits.maxKellyFraction !== undefined || limits.minNetEdgeCents !== undefined)
  ) {
    if (signal?.probability === undefined) reasons.push('forecast limits skipped: no P(YES)')
    else {
      if (signal.sourceId !== proposal.sourceId) return deny('signal identity mismatch')
      const p = proposal.outcome === 'NO' ? 1 - signal.probability : signal.probability,
        c = price! / 100,
        // All-in cost per $1 payout: the taker fee is charged on entry.
        cost = c + (feeBps / 10_000) * c * (1 - c)
      if (limits.maxKellyFraction !== undefined) {
        const kelly = (p - cost) / (1 - cost)
        if (!(kelly > 0)) return deny('no positive Kelly edge after fees')
        const cap = Math.floor((limits.maxKellyFraction * kelly * cash) / (cost * 100) + 1e-9)
        maxQuantity = Math.min(maxQuantity, cap)
        reasons.push(`fractional Kelly cap ${cap}`)
      }
      if (limits.minNetEdgeCents !== undefined && maxQuantity > 0) {
        const edge = p * 100 - price! - takerFeeCents(maxQuantity, price!, feeBps) / maxQuantity
        if (edge < limits.minNetEdgeCents)
          return deny(`net edge ${edge.toFixed(2)}¢ below ${limits.minNetEdgeCents}¢ after fees`)
      }
    }
  }
  return {
    allowed: maxQuantity > 0,
    maxQuantity,
    reasons: [...reasons, ...(maxQuantity === 0 ? ['zero executable quantity'] : [])],
    limits
  }
}
