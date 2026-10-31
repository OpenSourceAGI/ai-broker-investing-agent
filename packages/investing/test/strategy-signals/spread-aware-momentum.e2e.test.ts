import { expect, it, vi } from 'vitest'
import { runSpreadAwareMomentumDemo } from '../../examples/fixtures/spread-aware-momentum'
import { marketId, quotedTicks, quotedMarket } from '../../examples/fixtures/spread-aware-momentum'
import { createSpreadAwareMomentumSource } from '../../src/strategy-signals/sources/spread-aware-momentum'
import { MockVenue } from '../../src/strategy-signals/venues/mock-venue'
import { runEventDemo } from '../../src/strategy-signals/demo'

it('runs the existing research, trader and portfolio pipeline without network access', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network call'))
  try {
    const results = await runSpreadAwareMomentumDemo()
    expect(results.map(result => [result.baseline, result.signals[0].action])).toEqual([
      ['BUY', 'BUY'], ['BUY', 'HOLD'], ['BUY', 'HOLD'], ['BUY', 'HOLD'], ['BUY', 'BUY']
    ])
    for (const result of results) {
      expect(result.prompts.some(call => call.prompt.includes('kalshi-spread-aware-momentum'))).toBe(true)
      if (result.signals[0].action === 'BUY') {
        expect(result.verdict?.allowed).toBe(true)
        expect(result.fundManager?.decision).toBe('APPROVE')
        expect(result.fill?.status).toBe('FILLED')
        expect(result.fill?.fill).toMatchObject({ priceCents: 53, quantity: 10 })
        expect(result.after.kind === 'event' && result.after.portfolio.cashCents).toBe(9470)
        expect(result.prompts.map(call => call.rule)).toContain('research-manager')
        expect(result.prompts.map(call => call.rule)).toContain('fund-manager')
      } else {
        expect(result.approval).toBeUndefined()
        expect(result.fill).toBeUndefined()
        expect(result.after).toEqual(result.before)
      }
    }
    expect(fetch).not.toHaveBeenCalled()
  } finally {
    fetch.mockRestore()
  }
})

it('uses actual filled holdings for an exit and cannot execute a filtered entry', async () => {
  const source = createSpreadAwareMomentumSource()
  const ticks = quotedTicks(), market = quotedMarket(ticks[4])
  const venue = new MockVenue('kalshi', [market])
  const time = ticks[4].timestamp
  const signal = source.run({ ticks, marketId }, { evaluationTime: time, account: venue.snapshot() })
  const buy = await runEventDemo(signal, source, venue, market, time)
  expect(buy.fill?.status).toBe('FILLED')

  const exitTicks = quotedTicks([60], 6)
  exitTicks[0].timestamp = '2026-01-01T00:00:50Z'
  const exitMarket = quotedMarket(exitTicks[0])
  venue.setMarket(exitMarket)
  const sellSignal = source.run({ ticks: exitTicks, marketId }, {
    evaluationTime: exitTicks[0].timestamp, account: venue.snapshot()
  })
  const sell = await runEventDemo(sellSignal, source, venue, exitMarket, exitTicks[0].timestamp)
  expect(sell.fill?.fill).toMatchObject({ priceCents: 54, quantity: 10, realizedPnlCents: 10 })
  expect(sell.after.kind === 'event' && sell.after.portfolio.positions).toEqual({})

  const wideTicks = quotedTicks(undefined, 6), wideMarket = quotedMarket(wideTicks[4])
  const emptyVenue = new MockVenue('kalshi', [wideMarket])
  const hold = source.run({ ticks: wideTicks, marketId }, { evaluationTime: time, account: emptyVenue.snapshot() })
  // Even a scripted Trader that insists on BUY cannot turn this HOLD into an order.
  const forcedBuy = await runEventDemo(hold, source, emptyVenue, wideMarket, time, 'BUY')
  expect(forcedBuy.approval).toBeUndefined()
  expect(forcedBuy.after).toEqual(forcedBuy.before)
})
