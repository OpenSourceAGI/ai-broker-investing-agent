import { evaluateBtcFusion } from '../../prediction-markets/strategies/btc15m-fusion'
import type {
  BtcFusionConfig,
  BtcProcessorSignal
} from '../../prediction-markets/strategies/btc15m-fusion'
import type { SourceGuard, StrategySource } from '../types'
import { isRecord, isUtcTime, validateAccount } from '../validate'

export interface BtcFusionInput {
  venue: string
  marketId: string
  asOf: string
  signals: BtcProcessorSignal[]
  yesAskCents: number
  noAskCents: number
  quantity?: number
  config?: Partial<BtcFusionConfig>
}
/** Entry-only source limits. Drawdown and daily loss are not ported: snapshots lack the required historical state. */
export const btc15mGuard: SourceGuard = (proposal, context) => {
  if (proposal.action === 'SELL') return {}
  if (
    validateAccount(context.account).length ||
    context.account?.kind !== 'event' ||
    proposal.instrument.type !== 'event' ||
    context.account.venue !== proposal.instrument.venue ||
    !Number.isFinite(proposal.limitPriceCents) ||
    proposal.limitPriceCents! <= 0
  )
    return { deny: 'invalid BTC account or price' }
  const positions = Object.values(context.account.portfolio.positions).filter(p => p.quantity > 0)
  const marketId = proposal.instrument.marketId
  const own = positions.find(p => p.ticker === marketId && p.outcome === proposal.outcome)
  const ownCost = own ? own.quantity * own.averageEntryPriceCents : 0
  const exposure = positions.reduce((sum, p) => sum + p.quantity * p.averageEntryPriceCents, 0)
  if (!own && positions.length >= 5) return { deny: 'BTC maximum 5 positions' }
  return {
    maxQuantity: Math.max(
      0,
      Math.floor(Math.min(100 - ownCost, 1000 - exposure) / proposal.limitPriceCents!)
    )
  }
}
export const btc15mFusionSource: StrategySource<BtcFusionInput> = {
  id: 'btc15m-fusion',
  upstream:
    'Polymarket-BTC-15-Minute-Trading-Bot/core/strategy_brain/fusion_engine/signal_fusion.py (independent implementation)',
  maxSignalAgeMs: 5 * 60_000,
  guards: [btc15mGuard],
  run(input, context) {
    if (
      !isRecord(input) ||
      ![input.venue, input.marketId].every(
        x => typeof x === 'string' && x.trim() === x && x.length > 0
      ) ||
      !isUtcTime(input.asOf) ||
      !isUtcTime(context.evaluationTime) ||
      Date.parse(input.asOf) > Date.parse(context.evaluationTime) ||
      Date.parse(context.evaluationTime) - Date.parse(input.asOf) > this.maxSignalAgeMs! ||
      !Array.isArray(input.signals) ||
      input.signals.some(s => !isRecord(s) || !isUtcTime(s.timestamp)) ||
      ![input.yesAskCents, input.noAskCents].every(
        p => typeof p === 'number' && Number.isFinite(p) && p > 0 && p <= 100
      ) ||
      (input.quantity !== undefined &&
        (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)) ||
      (context.account &&
        (validateAccount(context.account).length ||
          context.account.kind !== 'event' ||
          context.account.venue !== input.venue))
    )
      throw new Error('invalid BTC input')
    const fused = evaluateBtcFusion(input.signals, context.evaluationTime, input.config)
    const base = {
      sourceId: this.id,
      upstream: this.upstream,
      instrument: { type: 'event' as const, venue: input.venue, marketId: input.marketId },
      asOf: input.asOf,
      confidence: fused?.confidence ?? 0,
      reasoning:
        'Weighted directional consensus; confidence is average processor confidence, not P(YES). Strict five-minute window uses evaluationTime.'
    }
    if (!fused?.actionable)
      return [
        {
          ...base,
          kind: 'signal',
          action: 'HOLD',
          reasoning: `${base.reasoning} No actionable recent fusion.`
        }
      ]
    const outcome = fused.direction === 'BULLISH' ? 'YES' : 'NO',
      priceCents = outcome === 'YES' ? input.yesAskCents : input.noAskCents
    const quantity = input.quantity ?? Math.floor(100 / priceCents)
    if (quantity === 0)
      return [
        { ...base, kind: 'signal', action: 'HOLD', reasoning: 'BTC notional is below one contract' }
      ]
    return [
      {
        ...base,
        instrument: { ...base.instrument, outcome },
        kind: 'order',
        action: 'BUY',
        order: {
          ticker: input.marketId,
          outcome,
          action: 'BUY',
          quantity,
          priceCents,
          timestamp: input.asOf,
          reason: base.reasoning
        },
        evidence: {
          score: fused.score,
          bullishContribution: fused.bullishContribution,
          bearishContribution: fused.bearishContribution,
          recentCount: fused.recentCount
        }
      }
    ]
  }
}
