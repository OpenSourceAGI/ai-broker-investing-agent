/**
 * @fileoverview The scheduled sync routes accept the CRON_SECRET bearer token
 * that worker/index.ts sends. They used to read `process.env.CRON_SECRET`,
 * which is undefined on Workers, so every scheduled run got a 401.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSession = vi.hoisted(() => vi.fn())
const syncMarketsIncremental = vi.hoisted(() => vi.fn())
const syncLeadersAndCategories = vi.hoisted(() => vi.fn())
const deactivateExpiredMarkets = vi.hoisted(() => vi.fn())
const syncLeaderboard = vi.hoisted(() => vi.fn())

vi.mock('@/lib/env/runtime', () => ({ serverEnv: vi.fn() }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }))
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock('@/packages/investing/src/prediction', () => ({
  syncMarketsIncremental,
  syncLeadersAndCategories,
  deactivateExpiredMarkets,
  syncLeaderboard,
}))

import { serverEnv } from '@/lib/env/runtime'
import { GET as syncMarketsGET } from '../sync-markets/route'
import { GET as syncPolymarketGET } from '../sync-polymarket/route'

const mockServerEnv = serverEnv as unknown as ReturnType<typeof vi.fn>

const cronRequest = (path: string, authorization?: string) =>
  new Request(`https://self.internal${path}`, {
    headers: authorization ? { authorization } : {},
  }) as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // The secret exists only on the Worker env, not on process.env.
  vi.stubEnv('CRON_SECRET', '')
  mockServerEnv.mockImplementation((name: string) => (name === 'CRON_SECRET' ? 'worker-secret' : undefined))
  getSession.mockResolvedValue(null)
  syncMarketsIncremental.mockResolvedValue({ markets: 3, pricePoints: 10, priceHistoryUpdates: 2, holders: 4, holderUpdates: 1 })
  syncLeadersAndCategories.mockResolvedValue({ leaders: 5, positions: 9 })
  deactivateExpiredMarkets.mockResolvedValue(7)
  syncLeaderboard.mockResolvedValue({ leaders: 100 })
})

describe('/api/cron/sync-markets', () => {
  it('runs for the scheduled dispatch carrying the Worker secret', async () => {
    const res = await syncMarketsGET(cronRequest('/api/cron/sync-markets', 'Bearer worker-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ success: true, markets: 3, cronJob: true })
    expect(syncMarketsIncremental).toHaveBeenCalledWith(1000, true, true)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('retires markets that closed since the last sync and refreshes the leaderboard', async () => {
    const res = await syncMarketsGET(cronRequest('/api/cron/sync-markets', 'Bearer worker-secret'))
    expect(await res.json()).toMatchObject({ deactivated: 7, leaderboard: { leaders: 100 } })
    expect(deactivateExpiredMarkets).toHaveBeenCalledOnce()
    expect(syncLeaderboard).toHaveBeenCalledWith({ limit: 100 })
  })

  it('still succeeds when only the leaderboard refresh fails', async () => {
    syncLeaderboard.mockRejectedValue(new Error('data-api 503'))
    const res = await syncMarketsGET(cronRequest('/api/cron/sync-markets', 'Bearer worker-secret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, deactivated: 7, leaderboard: { error: 'data-api 503' } })
  })

  it('rejects an anonymous caller', async () => {
    const res = await syncMarketsGET(cronRequest('/api/cron/sync-markets'))
    expect(res.status).toBe(401)
    expect(syncMarketsIncremental).not.toHaveBeenCalled()
  })

  it('rejects a wrong secret', async () => {
    const res = await syncMarketsGET(cronRequest('/api/cron/sync-markets', 'Bearer guessed'))
    expect(res.status).toBe(401)
  })

  it('still lets a signed-in user trigger it manually', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await syncMarketsGET(cronRequest('/api/cron/sync-markets'))
    expect(res.status).toBe(200)
  })

  it('reports a sync failure as a 500', async () => {
    syncMarketsIncremental.mockRejectedValue(new Error('gamma down'))
    const res = await syncMarketsGET(cronRequest('/api/cron/sync-markets', 'Bearer worker-secret'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('gamma down')
  })
})

describe('/api/cron/sync-polymarket', () => {
  it('runs a lightweight sync for the scheduled dispatch', async () => {
    const res = await syncPolymarketGET(cronRequest('/api/cron/sync-polymarket', 'Bearer worker-secret'))
    expect(res.status).toBe(200)
    expect(syncMarketsIncremental).toHaveBeenCalledWith(1000, false, false)
    expect(syncLeadersAndCategories).toHaveBeenCalled()
  })

  it('rejects an anonymous caller', async () => {
    const res = await syncPolymarketGET(cronRequest('/api/cron/sync-polymarket'))
    expect(res.status).toBe(401)
  })
})
