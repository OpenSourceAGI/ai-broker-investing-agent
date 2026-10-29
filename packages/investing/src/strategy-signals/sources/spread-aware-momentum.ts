import type { KalshiMomentumConfig } from '../../prediction-markets/types'
import { kalshiMomentumSource } from './kalshi-momentum'
import {
  readSpreadMomentum, spreadMomentumConfig, validateQuotedTick,
  type QuotedMomentumTick, type SpreadMomentumConfig
} from '../indicators/spread-aware-momentum'
import type { NormalizedSignal, StrategySource } from '../types'

export interface SpreadAwareMomentumInput {
  ticks: QuotedMomentumTick[]
  config?: Partial<KalshiMomentumConfig>
  marketId: string
}

/** Keep the existing bot's candidate and exit rules; qualify entries using quotes. */
export function createSpreadAwareMomentumSource(
  overrides: Partial<SpreadMomentumConfig> = {}
): StrategySource<SpreadAwareMomentumInput> {
  const config = spreadMomentumConfig(overrides)
  return {
    id: 'kalshi-spread-aware-momentum',
    upstream: `${kalshiMomentumSource.upstream}; local spread-aware entry filter`,
    maxSignalAgeMs: config.maxQuoteAgeMs,
    run(input, context) {
      if (typeof input.marketId !== 'string' || !input.marketId.trim() || input.marketId !== input.marketId.trim() ||
          input.ticks.some(tick => tick.ticker !== input.marketId))
        throw new Error('quote history must match marketId')
      for (const tick of input.ticks) validateQuotedTick(tick)
      const candidate = kalshiMomentumSource.run({ ...input, venue: 'kalshi' }, context)[0]
      const signal: NormalizedSignal = {
        ...candidate, sourceId: this.id, upstream: this.upstream, confidence: 0
      }
      const hold = (reasoning: string): NormalizedSignal[] => [{
        ...signal, kind: 'signal', action: 'HOLD', reasoning, order: undefined
      }]
      if (candidate.action === 'HOLD') return hold(candidate.reasoning)
      const last = input.ticks[input.ticks.length - 1]
      const outcome = candidate.order!.outcome!
      const bid = outcome === 'YES' ? last.yesBidCents : last.noBidCents
      const ask = outcome === 'YES' ? last.yesAskCents : last.noAskCents
      if (Date.parse(context.evaluationTime) - Date.parse(last.timestamp) > config.maxQuoteAgeMs)
        return hold('stale quotes')

      // Entry-quality filters must not suppress a stop-loss or reversal exit.
      if (candidate.action === 'SELL') {
        if (bid === null) return hold('missing executable bid for exit')
        const reason = `${candidate.order!.reason}; exit priced at held outcome bid`
        return [{ ...signal, reasoning: reason,
          order: { ...candidate.order!, priceCents: bid, reason } }]
      }

      const reading = readSpreadMomentum(input.ticks, outcome, context.evaluationTime, config)
      signal.evidence = { ...reading, ready: reading.ready ? 'yes' : 'no',
        minScore: config.minScore, costAllowanceCents: config.costAllowanceCents }
      signal.confidence = Math.abs(reading.score) / (1 + Math.abs(reading.score))
      if (!reading.ready) return hold(reading.reason)
      const directionalScore = outcome === 'YES' ? reading.score : -reading.score
      if (directionalScore < config.minScore)
        return hold(`entry filtered: directional score ${directionalScore.toFixed(3)} < ${config.minScore}`)
      if (ask === null || ask <= 0 || ask >= 100) return hold('no tradable entry ask')
      const reason = `${candidate.order!.reason}; spread-aware score ${directionalScore.toFixed(3)} >= ${config.minScore}`
      return [{ ...signal, reasoning: reason,
        order: { ...candidate.order!, priceCents: ask, reason } }]
    }
  }
}
