import { kalshiMomentumSource } from '../../src/strategy-signals/sources/kalshi-momentum'
import { createSpreadAwareMomentumSource } from '../../src/strategy-signals/sources/spread-aware-momentum'
import type { QuotedMomentumTick } from '../../src/strategy-signals/indicators/spread-aware-momentum'
import { fromKalshiMarket } from '../../src/strategy-signals/venues/kalshi-venue-mapping'
import { MockVenue } from '../../src/strategy-signals/venues/mock-venue'
import { runEventDemo } from '../../src/strategy-signals/demo'

export const marketId = 'SPREAD-MOMENTUM-FIXTURE'
export function quotedTicks(prices = [40, 43, 46, 49, 52], halfSpread = 1): QuotedMomentumTick[] {
  return prices.map((yesPriceCents, index) => ({
    ticker: marketId,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index * 10)).toISOString(),
    yesPriceCents,
    yesBidCents: yesPriceCents - halfSpread,
    yesAskCents: yesPriceCents + halfSpread,
    noBidCents: 100 - yesPriceCents - halfSpread,
    noAskCents: 100 - yesPriceCents + halfSpread
  }))
}

export function quotedMarket(tick: QuotedMomentumTick) {
  return fromKalshiMarket({
    ticker: tick.ticker, title: 'Will the fixture event occur?', status: 'active',
    close_time: '2026-01-02T00:00:00Z',
    yes_bid: tick.yesBidCents, yes_ask: tick.yesAskCents,
    no_bid: tick.noBidCents, no_ask: tick.noAskCents
  })
}

export async function runSpreadAwareMomentumDemo() {
  const source = createSpreadAwareMomentumSource()
  const cases = [
    { name: 'tight spread', ticks: quotedTicks(), time: '2026-01-01T00:00:40Z' },
    { name: 'wide spread', ticks: quotedTicks(undefined, 6), time: '2026-01-01T00:00:40Z' },
    { name: 'noisy path', ticks: quotedTicks([40, 50, 46, 48, 50, 52]), time: '2026-01-01T00:00:50Z' },
    { name: 'stale quotes', ticks: quotedTicks(), time: '2026-01-01T00:02:00Z' },
    { name: 'falling YES price', ticks: quotedTicks([60, 57, 54, 51, 48]), time: '2026-01-01T00:00:40Z' }
  ]
  const results = []
  for (const item of cases) {
    const market = quotedMarket(item.ticks[item.ticks.length - 1])
    const venue = new MockVenue('kalshi', [market])
    const input = { ticks: item.ticks, marketId }
    const context = { evaluationTime: item.time, account: venue.snapshot() }
    const baseline = kalshiMomentumSource.run(input, context)[0]
    const signals = source.run(input, context)
    const result = await runEventDemo(signals, source, venue, market, item.time)
    results.push({ name: item.name, baseline: baseline.action, ...result })
  }
  return results
}
