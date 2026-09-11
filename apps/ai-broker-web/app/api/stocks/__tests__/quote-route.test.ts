/**
 * @fileoverview Route tests for GET /api/stocks/quote/[symbol].
 *
 * The console this was written against was full of 500s for tickers that simply
 * do not exist ("GOOH", "GOOGLE"), because any failure to produce a quote —
 * including "no such stock" — was reported as a server fault. These tests pin
 * the status codes: 400 for something that is not a ticker, 404 for a ticker
 * with no data, and 500 reserved for an actual unexpected throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/packages/investing/src/stocks/unified-quote-service', () => ({
  getQuote: vi.fn(),
}))
vi.mock('@/packages/investing/src/stocks/finnhub-wrapper', () => ({
  finnhub: { getPeers: vi.fn(), getQuote: vi.fn() },
}))

import { NextRequest } from 'next/server'
import { getQuote } from '@/packages/investing/src/stocks/unified-quote-service'
import { finnhub } from '@/packages/investing/src/stocks/finnhub-wrapper'
import { routeContext } from '../../__tests__/helpers/fake-db'
import { GET } from '../quote/[symbol]/route'

const mockGetQuote = getQuote as unknown as ReturnType<typeof vi.fn>
const mockGetPeers = finnhub.getPeers as unknown as ReturnType<typeof vi.fn>
const mockGetProfile = finnhub.getQuote as unknown as ReturnType<typeof vi.fn>

/** A fully-populated quote as the unified service returns one. */
const quoteFor = (symbol: string) => ({
  success: true,
  data: {
    symbol,
    price: 332.6,
    change: 4.1,
    changePercent: 1.25,
    open: 330,
    high: 334,
    low: 329.5,
    previousClose: 328.5,
    volume: 23_510_000,
    marketCap: 4_000_000_000_000,
    currency: 'USD',
    name: 'Alphabet Inc.',
    exchange: 'NASDAQ',
    timestamp: new Date('2026-09-11T20:00:00Z'),
    source: 'yfinance' as const,
  },
})

// The handler reads `request.nextUrl`, which only a NextRequest carries.
const request = (symbol: string, search = '') =>
  new NextRequest(`http://localhost/api/stocks/quote/${encodeURIComponent(symbol)}${search}`)

const call = (symbol: string, search = '') =>
  GET(request(symbol, search), routeContext({ symbol }))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPeers.mockResolvedValue({ success: true, peers: ['MSFT', 'AAPL'] })
  mockGetProfile.mockResolvedValue({ success: true, data: {} })
})

describe('GET /api/stocks/quote/[symbol] — validation', () => {
  it.each([
    ['GOOGLE', 'INVALID_SYMBOL'],
    ['NOT A SYMBOL', 'INVALID_SYMBOL'],
    ['AAPL;DROP TABLE', 'INVALID_SYMBOL'],
  ])('answers %s with 400 %s without calling a provider', async (symbol, code) => {
    const res = await call(symbol)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ success: false, code })
    expect(mockGetQuote).not.toHaveBeenCalled()
  })

  it.each(['GOO', 'GOOH', 'GOOHL'])(
    'answers the partial ticker %s without calling a provider',
    async (partial) => {
      const res = await call(partial)

      expect(res.status).toBe(404)
      expect(mockGetQuote).not.toHaveBeenCalled()
    },
  )

  it('answers an unlisted but well-formed ticker with 404', async () => {
    const res = await call('ZZZZZ')

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ code: 'SYMBOL_NOT_FOUND' })
    expect(mockGetQuote).not.toHaveBeenCalled()
  })

  it('upper-cases the symbol before fetching', async () => {
    mockGetQuote.mockResolvedValue(quoteFor('AAPL'))

    await call('aapl')

    expect(mockGetQuote).toHaveBeenCalledWith('AAPL', expect.anything())
  })
})

describe('GET /api/stocks/quote/[symbol] — success', () => {
  it('maps the normalized quote onto the price and summary blocks', async () => {
    mockGetQuote.mockResolvedValue(quoteFor('GOOGL'))

    const res = await call('GOOGL')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      symbol: 'GOOGL',
      source: 'yfinance',
      data: {
        price: {
          regularMarketPrice: 332.6,
          regularMarketChange: 4.1,
          regularMarketChangePercent: 1.25,
          longName: 'Alphabet Inc.',
          exchange: 'NASDAQ',
        },
        summaryDetail: {
          open: 330,
          dayHigh: 334,
          dayLow: 329.5,
          previousClose: 328.5,
          regularMarketVolume: 23_510_000,
        },
      },
    })
  })

  it('attaches sector and industry from the bundled dataset', async () => {
    mockGetQuote.mockResolvedValue(quoteFor('AAPL'))

    const body = await (await call('AAPL')).json()

    expect(body.data.price.sector).toBeTruthy()
    expect(body.data.price.industry).toBeTruthy()
  })

  it('excludes the requested symbol from its own peer list', async () => {
    mockGetQuote.mockResolvedValue(quoteFor('AAPL'))
    mockGetPeers.mockResolvedValue({ success: true, peers: ['AAPL', 'MSFT'] })

    const body = await (await call('AAPL')).json()

    expect(body.data.peers).toEqual(['MSFT'])
  })

  it('bypasses the cache when live=true', async () => {
    mockGetQuote.mockResolvedValue(quoteFor('AAPL'))

    await call('AAPL', '?live=true')

    expect(mockGetQuote).toHaveBeenCalledWith('AAPL', { useCache: false })
  })

  it('uses the cache by default', async () => {
    mockGetQuote.mockResolvedValue(quoteFor('AAPL'))

    await call('AAPL')

    expect(mockGetQuote).toHaveBeenCalledWith('AAPL', { useCache: true })
  })

  it('still returns the quote when the peer lookup fails', async () => {
    mockGetQuote.mockResolvedValue(quoteFor('AAPL'))
    mockGetPeers.mockRejectedValue(new Error('finnhub down'))

    const res = await call('AAPL')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.peers).toEqual([])
  })

  it('still returns the quote when the profile lookup fails', async () => {
    mockGetQuote.mockResolvedValue(quoteFor('AAPL'))
    mockGetProfile.mockRejectedValue(new Error('finnhub down'))

    expect((await call('AAPL')).status).toBe(200)
  })
})

describe('GET /api/stocks/quote/[symbol] — upstream failures', () => {
  it('answers 404, not 500, when no provider has data for a real ticker', async () => {
    mockGetQuote.mockResolvedValue({ success: false, error: 'all sources failed' })

    const res = await call('AAPL')

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: 'QUOTE_UNAVAILABLE',
    })
  })

  it('answers 404 when the provider reports success with no payload', async () => {
    mockGetQuote.mockResolvedValue({ success: true, data: undefined })

    expect((await call('AAPL')).status).toBe(404)
  })

  it('answers 500 when the quote service throws unexpectedly', async () => {
    mockGetQuote.mockRejectedValue(new Error('socket hang up'))

    const res = await call('AAPL')

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      code: 'QUOTE_ERROR',
      error: 'socket hang up',
    })
  })
})
