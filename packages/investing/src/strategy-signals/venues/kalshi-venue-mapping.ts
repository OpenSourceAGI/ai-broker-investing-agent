/** PyKalshi MarketModel interface adapter. MIT, Copyright (c) 2024.
 * Full upstream notice is distributed in THIRD_PARTY_NOTICES.md. */
import type { VenueMarket } from '../types'
import { isRecord, isUtcTime } from '../validate'

export function fromKalshiMarket(raw: unknown): VenueMarket {
  if (
    !isRecord(raw) ||
    typeof raw.ticker !== 'string' ||
    !raw.ticker ||
    raw.ticker.trim() !== raw.ticker ||
    (raw.market_type !== undefined && raw.market_type !== null && raw.market_type !== 'binary')
  )
    throw new Error('invalid Kalshi binary market')
  const legacyCents = (value: unknown): number | null => {
    if (value === null || value === undefined) return null
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100)
      throw new Error('Kalshi quotes must be integer cents or null')
    return value
  }
  // Kalshi removed integer-cent quotes in 2026; `<field>_dollars` is a fixed-point
  // string (up to 6 decimals) parsed by digits, so no float error enters the price.
  const fields = raw as Record<string, unknown>
  const quote = (field: string): number | null => {
    const dollars = fields[`${field}_dollars`]
    const legacy = legacyCents(fields[field])
    if (dollars === null || dollars === undefined) return legacy
    if (typeof dollars !== 'string' || !/^(0|1)(\.\d{1,6})?$/.test(dollars))
      throw new Error('Kalshi dollar quotes must be fixed-point strings like "0.5600"')
    const [whole, fraction = ''] = dollars.split('.')
    const cents = Number(whole) * 100 + Number(fraction.padEnd(6, '0')) / 10_000
    if (cents > 100) throw new Error('Kalshi quote above $1')
    if (legacy !== null && legacy !== cents) throw new Error('conflicting Kalshi quote fields')
    return cents
  }
  if (
    raw.status !== undefined &&
    raw.status !== null &&
    ![
      'open',
      'active',
      'unopened',
      'paused',
      'closed',
      'settled',
      'initialized',
      'inactive',
      'determined',
      'disputed',
      'amended',
      'finalized'
    ].includes(String(raw.status))
  )
    throw new Error('unknown Kalshi market status')
  if (
    raw.title !== undefined &&
    raw.title !== null &&
    (typeof raw.title !== 'string' || !raw.title.trim())
  )
    throw new Error('invalid Kalshi title')
  if (raw.close_time !== undefined && raw.close_time !== null && !isUtcTime(raw.close_time))
    throw new Error('Kalshi close_time must be ISO UTC')
  if (
    raw.tick_size !== undefined &&
    raw.tick_size !== null &&
    (typeof raw.tick_size !== 'number' ||
      !Number.isFinite(raw.tick_size) ||
      raw.tick_size <= 0 ||
      raw.tick_size > 100)
  )
    throw new Error('invalid Kalshi tick size')
  const ticker = raw.ticker
  return {
    venue: 'kalshi',
    marketId: ticker,
    title: typeof raw.title === 'string' ? raw.title : ticker,
    status: raw.status === 'open' || raw.status === 'active' ? 'open' : 'closed',
    ...(typeof raw.close_time === 'string' ? { closesAt: raw.close_time } : {}),
    outcomes: [
      {
        outcomeId: `${ticker}:YES`,
        label: 'YES',
        side: 'YES',
        bidCents: quote('yes_bid'),
        askCents: quote('yes_ask'),
        ...(typeof raw.tick_size === 'number' ? { tickSizeCents: raw.tick_size } : {})
      },
      {
        outcomeId: `${ticker}:NO`,
        label: 'NO',
        side: 'NO',
        bidCents: quote('no_bid'),
        askCents: quote('no_ask'),
        ...(typeof raw.tick_size === 'number' ? { tickSizeCents: raw.tick_size } : {})
      }
    ]
  }
}
