/**
 * @fileoverview /api/leaderboard/sync refreshes ZuluTrade and Polymarket
 * leaders independently: one upstream failing must not discard the other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const syncZuluTraders = vi.hoisted(() => vi.fn())
const syncLeadersAndCategories = vi.hoisted(() => vi.fn())
const syncLeaderboard = vi.hoisted(() => vi.fn())

vi.mock('@/packages/investing/src/leaders/zulu', () => ({ syncZuluTraders }))
vi.mock('@/packages/investing/src/prediction', () => ({ syncLeadersAndCategories, syncLeaderboard }))

import { POST } from '../sync/route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  syncZuluTraders.mockResolvedValue({ traders: 75 })
  syncLeadersAndCategories.mockResolvedValue({ leaders: 50, positions: 900 })
  syncLeaderboard.mockResolvedValue({ leaders: 100 })
})

describe('POST /api/leaderboard/sync', () => {
  it('reports both sources on success', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      message: 'Sync completed successfully',
      results: {
        zulu: { traders: 75 },
        polymarket: { leaders: 50, positions: 900 },
        polymarketLeaderboard: { leaders: 100 },
      },
    })
    expect(syncLeaderboard).toHaveBeenCalledWith({ limit: 100 })
  })

  it('keeps the Polymarket result when ZuluTrade fails', async () => {
    syncZuluTraders.mockRejectedValue(new Error('Zulu fetch failed: 403'))
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.message).toBe('Sync completed with 1 failed source(s)')
    expect(body.results).toEqual({
      zulu: { error: 'Zulu fetch failed: 403' },
      polymarket: { leaders: 50, positions: 900 },
      polymarketLeaderboard: { leaders: 100 },
    })
  })

  it('keeps the ZuluTrade result when Polymarket fails with a non-Error', async () => {
    syncLeadersAndCategories.mockRejectedValue('rate limited')
    const body = await (await POST()).json()
    expect(body.results.polymarket).toEqual({ error: 'rate limited' })
    expect(body.results.zulu).toEqual({ traders: 75 })
  })

  it('keeps the official leaderboard when polymarketanalytics.com fails', async () => {
    syncLeadersAndCategories.mockRejectedValue(new Error('analytics 429'))
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toBe('Sync completed with 1 failed source(s)')
    expect(body.results.polymarketLeaderboard).toEqual({ leaders: 100 })
  })

  it('answers 502 when every source fails', async () => {
    syncZuluTraders.mockRejectedValue(new Error('a'))
    syncLeadersAndCategories.mockRejectedValue(new Error('b'))
    syncLeaderboard.mockRejectedValue(new Error('c'))
    const res = await POST()
    expect(res.status).toBe(502)
    expect((await res.json()).success).toBe(false)
  })
})
