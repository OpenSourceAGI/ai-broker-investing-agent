import { beforeEach, describe, expect, it, vi } from 'vitest'

// A buy-and-hold mock strategy: buy on the first bar, then hold. Works for any
// price-series length so each scenario below just varies the closes.
const { mockStrategies } = vi.hoisted(() => ({
  mockStrategies: [
    {
      name: 'Buy Hold',
      strategy: vi.fn((asset: { closings: number[] }) =>
        asset.closings.map((_, i) => (i === 0 ? 1 : 0)),
      ),
    },
  ],
}))

vi.mock('indicatorts', () => ({
  STRATEGY_INFOS: mockStrategies,
  backtest: vi.fn((_asset, strategies) =>
    strategies.map((info: unknown) => ({ info })),
  ),
}))

vi.mock('@/packages/investing/src/stocks/yahoo-finance-wrapper', () => ({
  yahooFinance: { getHistorical: vi.fn() },
}))

import { yahooFinance } from '@/packages/investing/src/stocks/yahoo-finance-wrapper'
import { POST } from '../route'

const mockGetHistorical = yahooFinance.getHistorical as unknown as ReturnType<
  typeof vi.fn
>

// Build a flat OHLCV series from a list of closes (one bar per day).
const seriesFromCloses = (closes: number[]) =>
  closes.map((close, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, '0')}`,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
  }))

const runBuyHold = async (closes: number[], initialCapital = 100000) => {
  mockGetHistorical.mockResolvedValue({
    success: true,
    data: seriesFromCloses(closes),
  })
  const response = await POST(
    new Request('http://localhost/api/backtest-technical', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        symbol: 'AAPL',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        initialCapital,
        strategyIds: ['buy-hold'],
      }),
    }) as never,
  )
  const body = await response.json()
  expect(response.status).toBe(200)
  return body.results[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('POST /api/backtest-technical maxDrawdown metric', () => {
  it('reports the peak-to-trough decline, not global-max minus global-min', async () => {
    // Buy 1000 shares at 100 (=100k). Equity: 100k -> 50k -> 80k -> 120k.
    // True max drawdown is the 100k -> 50k leg = 50%. The old formula used the
    // global max (120k) and global min (50k) => (120k-50k)/120k ≈ 58.33%.
    const result = await runBuyHold([100, 50, 80, 120])
    expect(result.maxDrawdown).toBeCloseTo(50, 6)
    // Other metrics stay intact: final value 120k on 100k => +20%.
    expect(result.finalValue).toBeCloseTo(120000, 6)
    expect(result.totalReturnPercent).toBeCloseTo(20, 6)
  })

  it('reports 0% drawdown for a monotonically rising equity curve', async () => {
    // Equity 100k -> 110k -> 120k never falls below its running peak. The old
    // formula reported a phantom (120k-100k)/120k ≈ 16.67% drawdown here.
    const result = await runBuyHold([100, 110, 120])
    expect(result.maxDrawdown).toBe(0)
    expect(result.finalValue).toBeCloseTo(120000, 6)
  })

  it('reports 0% drawdown for a flat equity curve', async () => {
    const result = await runBuyHold([100, 100, 100])
    expect(result.maxDrawdown).toBe(0)
    expect(result.totalReturnPercent).toBeCloseTo(0, 6)
  })
})
