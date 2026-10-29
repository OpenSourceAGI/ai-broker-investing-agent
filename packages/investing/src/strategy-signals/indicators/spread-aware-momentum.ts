import type { KalshiMarketTick } from '../../prediction-markets/types'
import type { Outcome } from '../types'
import { isUtcTime } from '../validate'

export interface QuotedMomentumTick extends KalshiMarketTick {
  yesBidCents: number | null
  yesAskCents: number | null
  noBidCents: number | null
  noAskCents: number | null
}

export interface SpreadMomentumConfig {
  window: number
  minScore: number
  costAllowanceCents: number
  maxQuoteAgeMs: number
  maxGapMs: number
}

export const DEFAULT_SPREAD_MOMENTUM_CONFIG: Readonly<SpreadMomentumConfig> = {
  window: 5,
  minScore: 0.5,
  costAllowanceCents: 1,
  maxQuoteAgeMs: 60_000,
  maxGapMs: 60_000
}

export interface SpreadMomentumReading {
  ready: boolean
  reason: string
  moveCents: number
  efficiency: number
  noiseCents: number
  spreadCents: number
  costCents: number
  score: number
}

export function spreadMomentumConfig(
  overrides: Partial<SpreadMomentumConfig> = {}
): Readonly<SpreadMomentumConfig> {
  const config = { ...DEFAULT_SPREAD_MOMENTUM_CONFIG, ...overrides }
  if (!Number.isSafeInteger(config.window) || config.window < 3)
    throw new Error('momentum window must contain at least three observations')
  for (const key of ['minScore', 'maxQuoteAgeMs', 'maxGapMs'] as const)
    if (!Number.isFinite(config[key]) || config[key] <= 0)
      throw new Error(`${key} must be positive and finite`)
  if (!Number.isFinite(config.costAllowanceCents) || config.costAllowanceCents < 0)
    throw new Error('cost allowance must be finite and nonnegative')
  return Object.freeze(config)
}

export function validateQuotedTick(tick: QuotedMomentumTick): void {
  for (const side of ['yes', 'no'] as const) {
    const bid = tick[`${side}BidCents`], ask = tick[`${side}AskCents`]
    for (const quote of [bid, ask])
      if (quote !== null && (!Number.isInteger(quote) || quote < 0 || quote > 100))
        throw new Error('quotes must be whole cents from 0 through 100, or null')
    if (bid !== null && ask !== null && bid > ask)
      throw new Error('crossed bid/ask quotes')
  }
}

/** A historical movement score, not P(YES) or an estimate of future profit. */
export function readSpreadMomentum(
  ticks: QuotedMomentumTick[],
  outcome: Outcome,
  evaluationTime: string,
  overrides: Partial<SpreadMomentumConfig> = {}
): SpreadMomentumReading {
  const config = spreadMomentumConfig(overrides)
  if (!isUtcTime(evaluationTime)) throw new Error('invalid evaluation time')
  const now = Date.parse(evaluationTime)
  for (let i = 0; i < ticks.length; i++) {
    const tick = ticks[i]
    validateQuotedTick(tick)
    if (!isUtcTime(tick.timestamp) || Date.parse(tick.timestamp) > now ||
        (i > 0 && (tick.ticker !== ticks[0].ticker ||
          Date.parse(tick.timestamp) <= Date.parse(ticks[i - 1].timestamp))))
      throw new Error('quotes must be one market in increasing UTC order without future data')
  }
  const empty: SpreadMomentumReading = {
    ready: false, reason: 'insufficient quote history', moveCents: 0,
    efficiency: 0, noiseCents: 0, spreadCents: 0, costCents: 0, score: 0
  }
  if (ticks.length < config.window) return empty
  const window = ticks.slice(-config.window), last = window[window.length - 1]
  if (now - Date.parse(last.timestamp) > config.maxQuoteAgeMs)
    return { ...empty, reason: 'stale quotes' }
  if (window.some((tick, i) => i > 0 &&
      Date.parse(tick.timestamp) - Date.parse(window[i - 1].timestamp) > config.maxGapMs))
    return { ...empty, reason: 'gap in quote history' }
  const bid = outcome === 'YES' ? last.yesBidCents : last.noBidCents
  const ask = outcome === 'YES' ? last.yesAskCents : last.noAskCents
  if (bid === null || ask === null ||
      window.some(tick => tick.yesBidCents === null || tick.yesAskCents === null))
    return { ...empty, reason: 'missing bid/ask quotes' }

  // Preserve half-cent midpoints; only the final executable quote needs whole cents.
  const mids = window.map(tick => (tick.yesBidCents! + tick.yesAskCents!) / 2)
  const moveCents = mids[mids.length - 1] - mids[0]
  const changes = mids.slice(1).map((mid, i) => mid - mids[i])
  const path = changes.reduce((sum, change) => sum + Math.abs(change), 0)
  const efficiency = path === 0 ? 0 : Math.abs(moveCents) / path
  const noiseCents = Math.sqrt(changes.reduce((sum, change) => sum + change * change, 0))
  const spreadCents = ask - bid
  const costCents = spreadCents + config.costAllowanceCents
  const residual = Math.max(0, Math.abs(moveCents) * efficiency - costCents)
  const score = Math.sign(moveCents) * residual / Math.max(1, noiseCents + costCents)
  return {
    ready: true, reason: 'quote window evaluated', moveCents, efficiency,
    noiseCents, spreadCents, costCents, score
  }
}
