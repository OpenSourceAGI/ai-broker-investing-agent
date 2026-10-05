/** Forecast adapter for Kalshi-Vibe-Bot; MIT Copyright (c) 2026 K-Jeez.
 * Recorded model output only: no model calls, credentials or market-price forecasts. */
import type { NormalizedSignal, StrategySource, VenueMarket } from '../types'
import { isRecord, isUtcTime, validateAccount } from '../validate'
import { kalshiVibeGuard, vibeBuyFailure, vibeKellyQuantity } from './kalshi-vibe-guards'

export interface KalshiVibeInput {
  market: VenueMarket
  forecast: { direction: 'YES' | 'NO' | 'SKIP'; probabilityYes: number; asOf: string }
}
const upstream = 'Kalshi-Vibe-Bot/backend/src/decision_engine/strategy_math.py + strategy_gates.py'

export const kalshiVibeSource: StrategySource<unknown> = {
  id: 'kalshi-vibe',
  upstream,
  guards: [kalshiVibeGuard],
  run(input, context) {
    if (!isRecord(input) || !isRecord(input.market) || !isRecord(input.forecast))
      throw new Error('Vibe requires a market and recorded forecast')
    const market = input.market,
      forecast = input.forecast
    if (
      market.venue !== 'kalshi' ||
      typeof market.marketId !== 'string' ||
      !market.marketId ||
      market.marketId.trim() !== market.marketId ||
      typeof market.title !== 'string' ||
      !market.title.trim() ||
      !['open', 'closed'].includes(String(market.status)) ||
      !Array.isArray(market.outcomes) ||
      market.outcomes.length !== 2
    )
      throw new Error('invalid Vibe binary market')
    if (market.closesAt !== undefined && !isUtcTime(market.closesAt))
      throw new Error('invalid market closing time')
    const sides = new Set<string>()
    for (const leg of market.outcomes) {
      if (
        !isRecord(leg) ||
        !['YES', 'NO'].includes(String(leg.side)) ||
        typeof leg.outcomeId !== 'string' ||
        !leg.outcomeId.trim() ||
        typeof leg.label !== 'string' ||
        !leg.label.trim()
      )
        throw new Error('invalid market outcome')
      for (const quote of [leg.bidCents, leg.askCents])
        if (
          quote !== null &&
          (typeof quote !== 'number' || !Number.isFinite(quote) || quote < 0 || quote > 100)
        )
          throw new Error('invalid market quote')
      sides.add(String(leg.side))
    }
    if (
      sides.size !== 2 ||
      !['YES', 'NO', 'SKIP'].includes(String(forecast.direction)) ||
      typeof forecast.probabilityYes !== 'number' ||
      !Number.isFinite(forecast.probabilityYes) ||
      forecast.probabilityYes < 0 ||
      forecast.probabilityYes > 1 ||
      !isUtcTime(forecast.asOf) ||
      !isUtcTime(context.evaluationTime) ||
      Date.parse(forecast.asOf) > Date.parse(context.evaluationTime)
    )
      throw new Error('invalid recorded forecast or evaluation time')
    if (
      validateAccount(context.account).length ||
      context.account?.kind !== 'event' ||
      context.account.venue !== 'kalshi'
    )
      throw new Error('Vibe requires current Kalshi holdings and cash')
    const direction = forecast.direction as 'YES' | 'NO' | 'SKIP'
    const outcome = direction === 'SKIP' ? undefined : direction
    const instrument = {
      type: 'event' as const,
      venue: 'kalshi',
      marketId: market.marketId,
      ...(outcome ? { outcome } : {})
    }
    const base: NormalizedSignal = {
      sourceId: 'kalshi-vibe',
      upstream,
      kind: 'signal',
      instrument,
      action: 'HOLD',
      confidence: outcome === 'NO' ? 1 - forecast.probabilityYes : forecast.probabilityYes,
      probability: forecast.probabilityYes,
      asOf: forecast.asOf,
      reasoning: 'recorded model selected SKIP'
    }
    if (
      market.status === 'closed' ||
      (typeof market.closesAt === 'string' &&
        Date.parse(market.closesAt) <= Date.parse(context.evaluationTime))
    )
      return [{ ...base, reasoning: 'market closed' }]
    if (!outcome) return [base]
    const leg = market.outcomes.find(leg => isRecord(leg) && leg.side === outcome) as Record<
      string,
      unknown
    >
    if (leg.askCents === null) return [{ ...base, reasoning: 'missing executable ask' }]
    const price = leg.askCents as number
    const deny = vibeBuyFailure(forecast.probabilityYes, outcome, price)
    if (deny) return [{ ...base, reasoning: deny }]
    const quantity = vibeKellyQuantity(
      context.account.portfolio.cashCents,
      forecast.probabilityYes,
      outcome,
      price
    )
    if (quantity === 0)
      return [{ ...base, reasoning: 'Kelly sizing or cash cannot fund one contract' }]
    const sideProbability =
      outcome === 'YES' ? forecast.probabilityYes : 1 - forecast.probabilityYes
    return [
      {
        ...base,
        action: 'BUY',
        reasoning: 'recorded P(YES); full Kelly with 5% cash ceiling and small-account fallback',
        sizing: { quantity, limitPriceCents: price },
        evidence: {
          outcome,
          edgePoints: sideProbability * 100 - price,
          fullKellyFraction: (sideProbability - price / 100) / (1 - price / 100),
          cashCents: context.account.portfolio.cashCents
        }
      }
    ]
  }
}
