import { describe, expect, it } from 'vitest'
import { readSpreadMomentum, spreadMomentumConfig } from '../../src/strategy-signals/indicators/spread-aware-momentum'
import { createSpreadAwareMomentumSource } from '../../src/strategy-signals/sources/spread-aware-momentum'
import { partitionValidSignals, validateSignal } from '../../src/strategy-signals/validate'
import { quotedTicks, marketId } from '../../examples/fixtures/spread-aware-momentum'
import type { AccountSnapshot } from '../../src/strategy-signals/types'

const time = '2026-01-01T00:00:40Z'
const source = createSpreadAwareMomentumSource()
const run = (ticks = quotedTicks(), account?: AccountSnapshot, evaluationTime = time) =>
  source.run({ ticks, marketId }, { evaluationTime, account })[0]

describe('spread-aware entry', () => {
  it('has a hand-calculated score and uses the ask, not the last trade', () => {
    // Four +3c moves: net/path = 12/12, sqrt(sum(d^2)) = 6.
    // Full spread 2c + reserve 1c gives score (12 - 3)/(6 + 3) = 1.
    const signal = run()
    expect(signal.evidence).toMatchObject({ moveCents: 12, efficiency: 1,
      noiseCents: 6, spreadCents: 2, costCents: 3, score: 1 })
    expect(signal.order).toMatchObject({ action: 'BUY', outcome: 'YES', priceCents: 53, quantity: 10 })
    expect(signal.confidence).toBe(0.5)
    expect(signal.probability).toBeUndefined()
    expect(validateSignal(signal)).toEqual([])
  })

  it('compares movement with the actual selected-outcome spread', () => {
    const ticks = quotedTicks([60, 57, 54, 51, 48])
    // NO quotes deliberately do not mirror YES quotes.
    ticks[4].noBidCents = 49
    ticks[4].noAskCents = 54
    const signal = run(ticks)
    expect(signal.order).toMatchObject({ outcome: 'NO', priceCents: 54 })
    expect(signal.evidence?.spreadCents).toBe(5)
    expect(signal.evidence?.score).toBe(-0.5)
  })

  it('rejects wide spreads and whipsaws despite the original entry pattern', () => {
    expect(run(quotedTicks(undefined, 6))).toMatchObject({ action: 'HOLD', order: undefined })
    const noisy = run(quotedTicks([40, 50, 46, 48, 50, 52]), undefined, '2026-01-01T00:00:50Z')
    expect(noisy.action).toBe('HOLD')
    expect(noisy.evidence?.efficiency).toBe(0.2)
  })

  it('does not manufacture executable quotes or round half-cent midpoints', () => {
    const ticks = quotedTicks()
    ticks[0].yesAskCents = 42
    expect(readSpreadMomentum(ticks, 'YES', time).moveCents).toBe(11.5)
    ticks[4].yesAskCents = null
    expect(run(ticks)).toMatchObject({ action: 'HOLD', reasoning: 'missing bid/ask quotes' })
  })

  it('requires a full window, rejects gaps and uses an explicit freshness boundary', () => {
    expect(run(quotedTicks().slice(1)).reasoning).toBe('insufficient quote history')
    expect(run(undefined, undefined, '2026-01-01T00:01:40Z').action).toBe('BUY')
    expect(run(undefined, undefined, '2026-01-01T00:01:40.001Z').reasoning).toBe('stale quotes')
    const ticks = quotedTicks()
    ticks[4].timestamp = '2026-01-01T00:02:00Z'
    expect(run(ticks, undefined, ticks[4].timestamp).reasoning).toBe('gap in quote history')
  })

  it('keeps its original timestamp so the graph can reject delayed signals', () => {
    const signal = run()
    const result = partitionValidSignals([signal], signal.instrument, '2026-01-01T00:02:00Z', source)
    expect(result.valid).toEqual([])
    expect(result.rejected[0].reasons).toContain('stale signal or invalid freshness limit')
  })

  it('lets an existing position exit at its bid even with a wide spread and short history', () => {
    const account: AccountSnapshot = { kind: 'event', venue: 'kalshi', portfolio: {
      initialCashCents: 10000, cashCents: 9470, realizedPnlCents: 0,
      unrealizedPnlCents: 0, equityCents: 10000, positions: { [`${marketId}:YES`]: {
        ticker: marketId, outcome: 'YES', quantity: 10, averageEntryPriceCents: 53,
        markPriceCents: 53, unrealizedPnlCents: 0
      } }
    } }
    const signal = run(quotedTicks([60], 6), account)
    expect(signal.order).toMatchObject({ action: 'SELL', outcome: 'YES', priceCents: 54, quantity: 10 })
    const ticks = quotedTicks([60], 6)
    ticks[0].yesBidCents = null
    expect(run(ticks, account).reasoning).toBe('missing executable bid for exit')
  })

  it('holds flat data and makes confidence depend on observed strength', () => {
    expect(run(quotedTicks([50, 50, 50, 50, 50])).action).toBe('HOLD')
    const weak = run(quotedTicks([40, 42, 44, 46, 48]))
    expect(weak.action).toBe('BUY')
    expect(weak.confidence).toBeLessThan(run().confidence)
  })

  it('holds when last-trade momentum disagrees with midpoint momentum', () => {
    const ticks = quotedTicks([60, 57, 54, 51, 48])
    ticks.forEach((tick, i) => { tick.yesPriceCents = 40 + i * 3 })
    expect(run(ticks).action).toBe('HOLD')
  })
})

describe('invalid inputs', () => {
  it('rejects crossed, fractional, nonfinite and out-of-range quotes', () => {
    for (const bid of [54, 50.5, NaN, Infinity, -1, 101]) {
      const ticks = quotedTicks()
      ticks[4].yesBidCents = bid
      expect(() => run(ticks)).toThrow()
    }
  })

  it('rejects mixed markets, future observations and duplicate times', () => {
    const mixed = quotedTicks()
    mixed[0].ticker = 'OTHER'
    expect(() => run(mixed)).toThrow()
    expect(() => source.run({ ticks: quotedTicks(), marketId: 'OTHER' }, { evaluationTime: time })).toThrow()
    expect(() => run(undefined, undefined, '2026-01-01T00:00:39Z')).toThrow()
    const duplicate = quotedTicks()
    duplicate[1].timestamp = duplicate[0].timestamp
    expect(() => run(duplicate)).toThrow()
  })

  it('validates configuration before use', () => {
    for (const config of [{ window: 2 }, { window: 3.5 }, { minScore: NaN },
      { minScore: 0 }, { costAllowanceCents: -1 }, { maxQuoteAgeMs: Infinity }, { maxGapMs: 0 }])
      expect(() => spreadMomentumConfig(config)).toThrow()
  })
})
