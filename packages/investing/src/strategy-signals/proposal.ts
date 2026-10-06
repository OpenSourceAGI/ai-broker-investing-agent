import type { Instrument, NormalizedSignal, Outcome, ProposalContext, TradeProposal } from './types'
import { matchesInstrument, validateAccount, validateSignal, isUtcTime } from './validate'

export function proposalId(
  sourceId: string,
  instrument: Instrument,
  outcome: Outcome | undefined,
  action: string,
  asOf: string
): string {
  return `${sourceId}:${instrument.type === 'event' ? instrument.venue : 'equity'}:${instrument.type === 'event' ? instrument.marketId : instrument.symbol}:${outcome ?? '-'}:${action}:${asOf}`
}
export function heldQuantity(context: ProposalContext, outcome?: Outcome): number {
  const a = context.account,
    i = context.instrument
  if (i.type === 'equity') return a?.kind === 'equity' ? (a.shares[i.symbol]?.quantity ?? 0) : 0
  return a?.kind === 'event' && a.venue === i.venue
    ? (a.portfolio.positions[`${i.marketId}:${outcome}`]?.quantity ?? 0)
    : 0
}
export function selectProposal(
  decision: string,
  valid: NormalizedSignal[],
  context: ProposalContext
): { proposal: TradeProposal; signal?: NormalizedSignal } | { reportOnly: string } {
  if (decision !== 'BUY' && decision !== 'SELL') return { reportOnly: 'Trader HOLD' }
  if (!isUtcTime(context.evaluationTime)) return { reportOnly: 'invalid evaluation time' }
  if (
    context.event &&
    (context.event.venue !==
      (context.instrument.type === 'event' ? context.instrument.venue : '') ||
      context.event.marketId !==
        (context.instrument.type === 'event' ? context.instrument.marketId : ''))
  )
    return { reportOnly: 'market identity mismatch' }
  if (
    context.event &&
    (context.event.status === 'closed' ||
      (context.event.closesAt !== undefined &&
        (!isUtcTime(context.event.closesAt) ||
          Date.parse(context.event.closesAt) <= Date.parse(context.evaluationTime))))
  )
    return { reportOnly: 'market closed' }
  const signals = valid
    .filter(
      s =>
        validateSignal(s, context.instrument).length === 0 &&
        s.action === decision &&
        matchesInstrument(s.instrument, context.instrument)
    )
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        a.sourceId.localeCompare(b.sourceId) ||
        b.asOf.localeCompare(a.asOf) ||
        proposalId(
          a.sourceId,
          a.instrument,
          a.instrument.type === 'event' ? a.instrument.outcome : undefined,
          a.action,
          a.asOf
        ).localeCompare(
          proposalId(
            b.sourceId,
            b.instrument,
            b.instrument.type === 'event' ? b.instrument.outcome : undefined,
            b.action,
            b.asOf
          )
        )
    )
  const signal = signals[0]
  if (!signal) {
    if (context.instrument.type !== 'equity') return { reportOnly: 'no agreeing event signal' }
    return {
      proposal: {
        proposalId: proposalId(
          'trader',
          context.instrument,
          undefined,
          decision,
          context.evaluationTime
        ),
        sourceId: 'trader',
        instrument: context.instrument,
        action: decision,
        quantity: Number.MAX_SAFE_INTEGER,
        asOf: context.evaluationTime
      }
    }
  }
  let outcome = signal.instrument.type === 'event' ? signal.instrument.outcome : undefined
  if (!outcome && (signal.evidence?.outcome === 'YES' || signal.evidence?.outcome === 'NO'))
    outcome = signal.evidence.outcome
  let price = signal.sizing?.limitPriceCents,
    quantity = signal.sizing?.quantity,
    action: 'BUY' | 'SELL' = decision
  if (signal.kind === 'order') {
    outcome = signal.order!.outcome ?? undefined
    price = signal.order!.priceCents
    quantity = signal.order!.quantity
  }
  if (signal.kind === 'portfolio') {
    if (validateAccount(context.account).length)
      return { reportOnly: 'portfolio target needs valid account' }
    const target = signal.targets!.find(
      t => t.quantity !== heldQuantity({ ...context, instrument: signal.instrument }, t.outcome)
    )
    if (!target) return { reportOnly: 'target already held' }
    const delta =
      target.quantity - heldQuantity({ ...context, instrument: signal.instrument }, target.outcome)
    outcome = target.outcome
    price = target.priceCents
    quantity = Math.abs(delta)
    action = delta > 0 ? 'BUY' : 'SELL'
    if (action !== decision) return { reportOnly: 'portfolio delta disagrees with Trader' }
  }
  if (
    price === undefined ||
    quantity === undefined ||
    (signal.instrument.type === 'event' && !outcome)
  )
    return { reportOnly: 'direction-only signal' }
  return {
    signal,
    proposal: {
      proposalId: proposalId(signal.sourceId, signal.instrument, outcome, action, signal.asOf),
      sourceId: signal.sourceId,
      instrument: signal.instrument,
      action,
      outcome,
      limitPriceCents: price,
      quantity,
      asOf: signal.asOf
    }
  }
}
