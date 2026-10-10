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
  let maxQuantity = Math.floor(
    Math.min(
      proposal.quantity,
      Math.max(0, limits.maxPositionPerMarket - held),
      price === undefined ? Number.MAX_SAFE_INTEGER : Math.floor(cash / price)
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
  return {
    allowed: maxQuantity > 0,
    maxQuantity,
    reasons: [...reasons, ...(maxQuantity === 0 ? ['zero executable quantity'] : [])],
    limits
  }
}
