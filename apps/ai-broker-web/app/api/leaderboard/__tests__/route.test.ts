/**
 * @fileoverview Route tests for /api/leaderboard: maps Zulu and Polymarket
 * traders into one display shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getZuluTraders = vi.hoisted(() => vi.fn())
const getLeaders = vi.hoisted(() => vi.fn())
const syncLeaderboard = vi.hoisted(() => vi.fn())

vi.mock('@/packages/investing/src/leaders/zulu', () => ({ getZuluTraders }))
vi.mock('@/packages/investing/src/prediction', () => ({ getLeaders, syncLeaderboard }))

import { GET } from '../route'

const req = (qs = '') => ({ nextUrl: new URL(`http://localhost/api/leaderboard${qs}`) }) as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/leaderboard — zulu (default)', () => {
  it('maps traders into ranked rows', async () => {
    getZuluTraders.mockResolvedValue([
      { providerId: 11, name: 'Alpha', roiProfit: 12.5, winRate: 61, balance: 1000, avgTradeSeconds: 7200, maxDrawdownPercent: 8, isEa: false },
      { providerId: 12, name: 'Beta', winRate: '55.5', isEa: true },
    ])
    const body = await (await GET(req())).json()

    expect(getZuluTraders).toHaveBeenCalledWith(50)
    expect(body.success).toBe(true)
    expect(body.count).toBe(2)
    expect(body.data[0]).toEqual({
      id: '11',
      rank: 1,
      name: 'Alpha',
      overallPnL: 12.5,
      winRate: 61,
      activePositions: 0,
      currentValue: 1000,
      avgHoldingPeriod: '2h',
      markets: ['Forex', 'Indices'],
      maxDrawdown: '8%',
      volatility: 'Medium',
      type: 'expert',
    })
    expect(body.data[1]).toMatchObject({
      id: '12',
      rank: 2,
      overallPnL: 0,
      winRate: 55.5,
      currentValue: 0,
      avgHoldingPeriod: 'N/A',
      type: 'bot',
    })
  })

  it('honours the limit parameter and defaults a missing win rate to 0', async () => {
    getZuluTraders.mockResolvedValue([{ providerId: 2, name: 'y' }])
    const body = await (await GET(req('?limit=5'))).json()
    expect(getZuluTraders).toHaveBeenCalledWith(5)
    expect(body.data[0].winRate).toBe(0)
  })
})

describe('GET /api/leaderboard — polymarket', () => {
  const leader = {
    trader: '0xabcdef1234567890',
    rank: 3,
    userName: 'whale',
    xUsername: 'whale_x',
    verifiedBadge: true,
    profileImage: 'img',
    pnl: 500,
    vol: 9000,
    winRate: 0.62,
    activePositions: 4,
    currentValue: 1234,
  }

  it('maps leaders without syncing by default', async () => {
    getLeaders.mockResolvedValue([leader])
    const body = await (await GET(req('?source=polymarket'))).json()
    expect(syncLeaderboard).not.toHaveBeenCalled()
    expect(getLeaders).toHaveBeenCalledWith('vol', 50)
    expect(body.data[0]).toMatchObject({
      id: '0xabcdef1234567890',
      rank: 3,
      name: 'whale',
      overallPnL: 500,
      volume: 9000,
      winRate: 62,
      activePositions: 4,
      currentValue: 1234,
      markets: ['Prediction'],
      type: 'whale',
      proxyWallet: '0xabcdef1234567890',
    })
  })

  it('syncs first when asked, mapping orderBy to the upstream key', async () => {
    getLeaders.mockResolvedValue([])
    await GET(req('?source=polymarket&sync=true&orderBy=pnl&limit=10'))
    expect(syncLeaderboard).toHaveBeenCalledWith({ limit: 10, orderBy: 'PNL' })
    expect(getLeaders).toHaveBeenCalledWith('pnl', 10)

    await GET(req('?source=polymarket&sync=true'))
    expect(syncLeaderboard).toHaveBeenLastCalledWith({ limit: 50, orderBy: 'VOL' })
  })

  it('falls back to a shortened wallet for anonymous traders and zeroes for missing numbers', async () => {
    getLeaders.mockResolvedValue([{ trader: '0xabcdef1234567890', overallGain: 7 }, {}])
    const body = await (await GET(req('?source=polymarket'))).json()
    expect(body.data[0]).toMatchObject({ name: '0xabcdef...', overallPnL: 7, winRate: 0, rank: 0, volume: 0 })
    expect(body.data[1]).toMatchObject({ name: 'Anonymous', overallPnL: 0 })
  })
})

describe('GET /api/leaderboard — other', () => {
  it('returns an empty result for an unknown source', async () => {
    const body = await (await GET(req('?source=nope'))).json()
    expect(body).toEqual({ success: true, data: [], count: 0 })
  })

  it('answers 500 with the error when a provider fails', async () => {
    getZuluTraders.mockRejectedValue(new Error('upstream down'))
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: 'upstream down' })
  })
})
