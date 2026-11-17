/**
 * @fileoverview Route tests for /api/backtest-technical. The route only
 * validates, loads bars and calls packages/investing; these tests run the
 * real backtest engine and demo fixtures with Yahoo Finance mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/packages/investing/src/stocks/yahoo-finance-wrapper', () => ({
  yahooFinance: { getHistorical: vi.fn() },
}))

import { yahooFinance } from '@/packages/investing/src/stocks/yahoo-finance-wrapper'
import { BACKTEST_CATALOG, DEFAULT_COSTS } from '@/packages/investing/src/backtest'
import { GET, POST } from '../route'

const getHistorical = yahooFinance.getHistorical as unknown as ReturnType<typeof vi.fn>

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/backtest-technical', {
      method: 'POST',
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
  )
}

const demo2023 = { symbol: 'AAPL', startDate: '2023-01-01', endDate: '2023-12-31', demo: true }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/backtest-technical', () => {
  it('demo run returns ok results and Kalshi momentum unavailable', async () => {
    const res = await post({ ...demo2023, strategyIds: 'all' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, symbol: 'AAPL', dataSource: 'demo', costs: DEFAULT_COSTS })
    expect(body.barCount).toBeGreaterThan(240)
    expect(body.results).toHaveLength(BACKTEST_CATALOG.length)
    const byId = Object.fromEntries(body.results.map((r: { strategyId: string }) => [r.strategyId, r]))
    expect(byId['hedge-fund-technicals'].status).toBe('ok')
    expect(byId['kalshi-momentum']).toMatchObject({ status: 'unavailable', reason: 'unsupported-asset' })
    expect(getHistorical).not.toHaveBeenCalled()
  })

  it('BACKTEST_DEMO=1 uses fixtures without the body flag', async () => {
    vi.stubEnv('BACKTEST_DEMO', '1')
    const res = await post({ ...demo2023, demo: undefined, strategyIds: ['buy-hold'] })
    expect((await res.json()).dataSource).toBe('demo')
    expect(getHistorical).not.toHaveBeenCalled()
  })

  it('passes costs and params through to the engine', async () => {
    const res = await post({
      ...demo2023,
      strategyIds: ['buy-hold'],
      costs: { feeBps: 0, slippageBps: 0, positionSizePct: 50 },
    })
    const body = await res.json()
    expect(body.costs).toEqual({ feeBps: 0, slippageBps: 0, positionSizePct: 50 })
    const trade = body.results[0].metrics.trades[0]
    expect(trade.fee).toBe(0)
    expect(trade.shares * trade.price).toBeLessThanOrEqual(50_000)
  })

  it('start after end → 400', async () => {
    const res = await post({ ...demo2023, startDate: '2024-01-01', endDate: '2023-01-01' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/startDate/)
  })

  it('a range longer than 10 years → 400 without loading bars', async () => {
    const res = await post({ symbol: 'XYZ', startDate: '2000-01-01', endDate: '2024-12-31' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/10 years/)
    expect(getHistorical).not.toHaveBeenCalled()
  })

  it('missing symbol → 400', async () => {
    const res = await post({ ...demo2023, symbol: '' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/symbol/)
  })

  it('non-positive capital → 400', async () => {
    const res = await post({ ...demo2023, initialCapital: -5 })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/initialCapital/)
  })

  it('fee 600 bps → 400', async () => {
    const res = await post({ ...demo2023, costs: { feeBps: 600 } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/feeBps/)
  })

  it('strategyIds that is neither a list nor "all" → 400', async () => {
    const res = await post({ ...demo2023, strategyIds: 'macd' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/strategyIds/)
  })

  it('more than 50 strategy ids → 400 before any work', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `strategy-${i}`)
    const res = await post({ ...demo2023, strategyIds: ids })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/at most 50/)
  })

  it('a strategy id longer than 64 characters → 400', async () => {
    const res = await post({ ...demo2023, strategyIds: ['x'.repeat(65)] })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/64 characters/)
  })

  it('duplicate ids count once toward the limit', async () => {
    const res = await post({ ...demo2023, strategyIds: Array.from({ length: 60 }, () => 'buy-hold') })
    expect(res.status).toBe(200)
    expect((await res.json()).results).toHaveLength(1)
  })

  it('demo with TSLA → 400 listing AAPL, MSFT, SPY', async () => {
    const res = await post({ ...demo2023, symbol: 'TSLA' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/AAPL, MSFT, SPY/)
  })

  it('a range with no bars → 400', async () => {
    const res = await post({ ...demo2023, startDate: '2030-01-01', endDate: '2030-06-30' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/No daily bars/)
  })

  it('yahoo bars with nulls are dropped', async () => {
    getHistorical.mockResolvedValue({
      success: true,
      data: [
        { date: new Date('2024-01-02'), open: 10, high: 11, low: 9, close: 10, volume: 100 },
        { date: new Date('2024-01-03'), open: null, high: null, low: null, close: null, volume: null },
        { date: new Date('2024-01-04'), open: 10, high: 12, low: 10, close: 12, volume: 100 },
      ],
    })
    const res = await post({ symbol: 'XYZ', startDate: '2024-01-01', endDate: '2024-01-31', strategyIds: ['buy-hold'] })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ dataSource: 'yahoo', barCount: 2 })
    expect(body.results[0].status).toBe('ok')
  })

  it('a Yahoo failure → 502 with a message', async () => {
    getHistorical.mockResolvedValue({ success: false, error: 'rate limited' })
    const res = await post({ symbol: 'XYZ', startDate: '2024-01-01', endDate: '2024-01-31' })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/XYZ/)
  })
})

describe('GET /api/backtest-technical', () => {
  it('lists every catalog strategy with availability, cost limits and demo symbols', async () => {
    const res = await GET()
    const body = await res.json()
    expect(body.strategies).toHaveLength(BACKTEST_CATALOG.length)
    expect(body.strategies.find((s: { id: string }) => s.id === 'kalshi-momentum').availability).toMatchObject({
      available: false,
      reason: 'unsupported-asset',
    })
    expect(body.costs.defaults).toEqual(DEFAULT_COSTS)
    expect(body.costs.limits.feeBps).toEqual({ min: 0, max: 500 })
    expect(body.demoSymbols).toEqual(['AAPL', 'MSFT', 'SPY'])
  })
})
