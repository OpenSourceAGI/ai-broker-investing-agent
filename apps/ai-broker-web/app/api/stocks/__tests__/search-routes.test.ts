/**
 * @fileoverview Route tests for the two lookup endpoints a search box calls:
 * /api/stocks/autocomplete (local dataset) and /api/stocks/search (Yahoo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const yahooSearch = vi.hoisted(() => vi.fn())

vi.mock('yahoo-finance2', () => ({
  default: class {
    search = yahooSearch
  },
}))

import { GET as autocompleteRoute } from '../autocomplete/route'
import { GET as searchRoute } from '../search/route'

const autocompleteCall = (query: string) =>
  autocompleteRoute(new NextRequest(`http://localhost/api/stocks/autocomplete${query}`))

const searchCall = (query: string) =>
  searchRoute(new NextRequest(`http://localhost/api/stocks/search${query}`))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/stocks/autocomplete', () => {
  it('returns an empty list for a missing query rather than an error', async () => {
    const res = await autocompleteCall('')

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true, data: [] })
  })

  it('matches on a symbol prefix', async () => {
    const body = await (await autocompleteCall('?q=aapl')).json()

    expect(body.success).toBe(true)
    expect(body.data.some((row: any) => row.symbol === 'AAPL')).toBe(true)
  })

  it('matches on a substring of the company name', async () => {
    const body = await (await autocompleteCall('?q=alphabet')).json()

    expect(body.data.length).toBeGreaterThan(0)
    expect(
      body.data.every((row: any) =>
        `${row.symbol} ${row.name}`.toLowerCase().includes('alphabet'),
      ),
    ).toBe(true)
  })

  it('is case-insensitive', async () => {
    const lower = await (await autocompleteCall('?q=aapl')).json()
    const upper = await (await autocompleteCall('?q=AAPL')).json()

    expect(upper.data).toEqual(lower.data)
  })

  it('returns ten suggestions by default', async () => {
    const body = await (await autocompleteCall('?q=a')).json()

    expect(body.data).toHaveLength(10)
  })

  it('honors an explicit limit', async () => {
    const body = await (await autocompleteCall('?q=a&limit=3')).json()

    expect(body.data).toHaveLength(3)
  })

  it('falls back to the default when the limit is not a number', async () => {
    // `parseInt('abc')` is NaN, and `length >= NaN` is never true, so an
    // unguarded limit let this walk the whole dataset into the response.
    const body = await (await autocompleteCall('?q=a&limit=abc')).json()

    expect(body.data).toHaveLength(10)
  })

  it('clamps a limit above the ceiling', async () => {
    const body = await (await autocompleteCall('?q=a&limit=100000')).json()

    expect(body.data.length).toBeLessThanOrEqual(50)
  })

  it('clamps a zero or negative limit to at least one result', async () => {
    expect((await (await autocompleteCall('?q=a&limit=0')).json()).data).toHaveLength(1)
    expect((await (await autocompleteCall('?q=a&limit=-5')).json()).data).toHaveLength(1)
  })

  it('returns an empty list for a query that matches nothing', async () => {
    const body = await (await autocompleteCall('?q=zzzzzznotaticker')).json()

    expect(body.data).toEqual([])
    expect(body.count).toBe(0)
  })
})

describe('GET /api/stocks/search', () => {
  it('answers 400 MISSING_QUERY when q is absent', async () => {
    const res = await searchCall('')

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ code: 'MISSING_QUERY' })
    expect(yahooSearch).not.toHaveBeenCalled()
  })

  it('returns the provider quotes with a count', async () => {
    yahooSearch.mockResolvedValue({
      quotes: [{ symbol: 'AAPL' }, { symbol: 'AAPLW' }],
    })

    const res = await searchCall('?q=apple')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, query: 'apple', count: 2 })
    expect(yahooSearch).toHaveBeenCalledWith('apple')
  })

  it('reports a zero count when the provider returns no quotes', async () => {
    yahooSearch.mockResolvedValue({})

    const body = await (await searchCall('?q=nothing')).json()

    expect(body.count).toBe(0)
  })

  it('answers 500 SEARCH_ERROR when the provider throws', async () => {
    yahooSearch.mockRejectedValue(new Error('yahoo down'))

    const res = await searchCall('?q=apple')

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      code: 'SEARCH_ERROR',
      error: 'yahoo down',
    })
  })
})
