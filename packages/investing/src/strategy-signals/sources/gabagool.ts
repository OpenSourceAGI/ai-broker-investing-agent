import {
  evaluateGabagool,
  normalizeGabagoolConfig
} from '../../prediction-markets/strategies/gabagool'
import type { GabagoolConfig } from '../../prediction-markets/strategies/gabagool'
import type { StrategySource } from '../types'
import { isRecord, isUtcTime, validateAccount } from '../validate'

export interface GabagoolInput {
  venue: string
  marketId: string
  asOf: string
  yesAskCents: number
  noAskCents: number
  config?: Partial<GabagoolConfig>
}
export const gabagoolSource: StrategySource<GabagoolInput> = {
  id: 'gabagool',
  upstream: 'poly-bot-gabagool/src/order-builder/copytrade.ts (independent implementation)',
  maxSignalAgeMs: 5 * 60_000,
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
      validateAccount(context.account).length ||
      context.account?.kind !== 'event' ||
      context.account.venue !== input.venue
    )
      throw new Error('invalid gabagool input or account')
    const c = normalizeGabagoolConfig(input.config)
    const positions = context.account.portfolio.positions
    const holding = (side: 'YES' | 'NO') => {
      const p = positions[`${input.marketId}:${side}`]
      return { quantity: p?.quantity ?? 0, averagePriceCents: p?.averageEntryPriceCents ?? 0 }
    }
    const held = { YES: holding('YES'), NO: holding('NO') }
    const decision = evaluateGabagool(input, held, c)
    const base = {
      sourceId: this.id,
      upstream: this.upstream,
      instrument: { type: 'event' as const, venue: input.venue, marketId: input.marketId },
      confidence: 1,
      asOf: input.asOf,
      reasoning: `${decision.reason}; confidence 1 denotes deterministic rule satisfaction, not a forecast`,
      evidence: {
        yesHeld: held.YES.quantity,
        noHeld: held.NO.quantity,
        yesActualAverageCents: held.YES.averagePriceCents,
        noActualAverageCents: held.NO.averagePriceCents,
        incompleteHedge: held.YES.quantity !== held.NO.quantity ? 'yes' : 'no'
      }
    }
    if (!decision.nextSide || decision.reason.startsWith('waiting'))
      return [{ ...base, kind: 'signal', action: 'HOLD' }]
    const next = decision.nextSide,
      other = next === 'YES' ? 'NO' : 'YES'
    return [
      {
        ...base,
        kind: 'portfolio',
        action: 'BUY',
        targets: [
          {
            ticker: input.marketId,
            outcome: next,
            quantity: c.quantityPerSide,
            priceCents: decision.limitPriceCents!
          },
          {
            ticker: input.marketId,
            outcome: other,
            quantity: c.quantityPerSide,
            priceCents: other === 'YES' ? input.yesAskCents : input.noAskCents
          }
        ]
      }
    ]
  }
}
