/** pmxt UnifiedMarket interface adapter; MIT Copyright (c) 2026 pmxt.dev.
 * Full notice: THIRD_PARTY_NOTICES.md. No SDK or server is imported. */
import type { VenueMarket } from '../types'
import { isRecord, isUtcTime } from '../validate'

export interface PmxtMappingOptions {
  venue?: string
  /** Demo only: use point prices as synthetic bid=ask quotes. */ priceAsQuote?: boolean
}
export function fromPmxtMarket(raw: unknown, options: PmxtMappingOptions = {}): VenueMarket {
  if (
    !isRecord(raw) ||
    typeof raw.marketId !== 'string' ||
    !raw.marketId ||
    raw.marketId.trim() !== raw.marketId ||
    typeof raw.title !== 'string' ||
    !raw.title.trim() ||
    !Array.isArray(raw.outcomes) ||
    raw.outcomes.length !== 2
  )
    throw new Error('pmxt requires a binary market')
  const venue = options.venue ?? 'polymarket'
  if (!venue || venue.trim() !== venue) throw new Error('invalid pmxt venue')
  const resolution =
    raw.resolutionDate instanceof Date ? raw.resolutionDate.toISOString() : raw.resolutionDate
  if (!isUtcTime(resolution)) throw new Error('pmxt resolutionDate must be ISO UTC or a valid Date')
  if (
    raw.tickSize !== undefined &&
    (typeof raw.tickSize !== 'number' ||
      !Number.isFinite(raw.tickSize) ||
      raw.tickSize <= 0 ||
      raw.tickSize > 1)
  )
    throw new Error('invalid pmxt tick size')
  if (raw.status !== undefined && !['open', 'closed'].includes(String(raw.status)))
    throw new Error('unknown pmxt market status')
  const price = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
      throw new Error('invalid pmxt dollar quote')
    return value * 100
  }
  const outcomes: VenueMarket['outcomes'] = raw.outcomes.map(leg => {
    if (
      !isRecord(leg) ||
      typeof leg.outcomeId !== 'string' ||
      !leg.outcomeId ||
      leg.outcomeId.trim() !== leg.outcomeId ||
      typeof leg.label !== 'string' ||
      !['YES', 'NO'].includes(leg.label.toUpperCase()) ||
      (leg.marketId !== undefined && leg.marketId !== raw.marketId)
    )
      throw new Error('unknown pmxt outcome identity or label')
    const pointPrice = price(leg.price)
    return {
      outcomeId: leg.outcomeId,
      label: leg.label,
      side: leg.label.toUpperCase() as 'YES' | 'NO',
      bidCents:
        leg.bid === undefined || leg.bid === null
          ? options.priceAsQuote
            ? pointPrice
            : null
          : price(leg.bid),
      askCents:
        leg.ask === undefined || leg.ask === null
          ? options.priceAsQuote
            ? pointPrice
            : null
          : price(leg.ask),
      ...(typeof raw.tickSize === 'number' ? { tickSizeCents: raw.tickSize * 100 } : {})
    }
  })
  if (
    new Set(outcomes.map(leg => leg.side)).size !== 2 ||
    new Set(outcomes.map(leg => leg.outcomeId)).size !== 2
  )
    throw new Error('duplicate pmxt outcome identity or side')
  return {
    venue,
    marketId: raw.marketId,
    title: raw.title,
    ...(typeof raw.description === 'string' && raw.description.trim()
      ? { question: raw.description }
      : {}),
    status: raw.status === 'closed' ? 'closed' : 'open',
    closesAt: resolution,
    outcomes
  }
}
