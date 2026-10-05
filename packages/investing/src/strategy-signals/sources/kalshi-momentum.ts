import type { KalshiMarketTick, KalshiMomentumConfig } from '../../prediction-markets/types'
import {
  createKalshiMomentumState,
  evaluateKalshiMomentumTick,
  normalizeKalshiMomentumConfig
} from '../../prediction-markets/strategies/kalshi-momentum'
import type { StrategySource } from '../types'
import { isUtcTime, validateAccount } from '../validate'

export interface MomentumInput {
  ticks: KalshiMarketTick[]
  config?: Partial<KalshiMomentumConfig>
  venue?: string
  marketId?: string
}
export const kalshiMomentumSource: StrategySource<MomentumInput> = {
  id: 'kalshi-momentum',
  upstream: 'kalshi-bot-api/examples/momentum_bot.py',
  run(input, context) {
    const config = normalizeKalshiMomentumConfig(input.config),
      venue = input.venue ?? 'kalshi'
    if (!isUtcTime(context.evaluationTime)) throw new Error('invalid evaluation time')
    if (context.account && validateAccount(context.account).length)
      throw new Error('invalid momentum account')
    let state = createKalshiMomentumState()
    const ticks = input.ticks
    for (let i = 0; i < ticks.length; i++) {
      const t = ticks[i]
      if (
        !isUtcTime(t.timestamp) ||
        Date.parse(t.timestamp) > Date.parse(context.evaluationTime) ||
        (i > 0 &&
          (t.ticker !== ticks[0].ticker ||
            Date.parse(t.timestamp) <= Date.parse(ticks[i - 1].timestamp)))
      )
        throw new Error(
          'ticks must be one market in strictly increasing UTC order without future data'
        )
      if (i < ticks.length - 1) state = evaluateKalshiMomentumTick(t, state, config).state
    }
    const last = ticks.at(-1)
    if (!last)
      return [
        {
          sourceId: this.id,
          upstream: this.upstream,
          kind: 'signal',
          instrument: { type: 'event', venue, marketId: input.marketId ?? 'empty' },
          action: 'HOLD',
          confidence: config.momentumThreshold / config.lookback,
          reasoning: 'no ticks',
          asOf: context.evaluationTime
        }
      ]
    if (context.account?.kind === 'event' && context.account.venue === venue) {
      const positions = Object.values(context.account.portfolio.positions).filter(
        p => p.ticker === last.ticker && p.quantity > 0
      )
      if (positions.length > 1) throw new Error('momentum supports one outcome holding')
      const p = positions[0]
      if (p)
        state.position = {
          ticker: p.ticker,
          outcome: p.outcome,
          quantity: p.quantity,
          entryPriceCents: p.averageEntryPriceCents
        }
    }
    const intent = evaluateKalshiMomentumTick(last, state, config).intent
    return [
      {
        sourceId: this.id,
        upstream: this.upstream,
        kind: intent.action === 'HOLD' ? 'signal' : 'order',
        instrument: {
          type: 'event',
          venue,
          marketId: last.ticker,
          ...(intent.outcome ? { outcome: intent.outcome } : {})
        },
        action: intent.action,
        confidence: config.momentumThreshold / config.lookback,
        reasoning: `${intent.reason}; confidence = momentumThreshold / lookback`,
        asOf: last.timestamp,
        ...(intent.action === 'HOLD' ? {} : { order: intent })
      }
    ]
  }
}
