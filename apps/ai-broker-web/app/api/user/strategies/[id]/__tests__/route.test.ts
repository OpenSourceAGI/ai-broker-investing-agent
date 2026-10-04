/**
 * @fileoverview Route tests for /api/user/strategies/[id] (update / delete),
 * both scoped to the caller's own strategies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../../../__tests__/helpers/fake-db'
import { PATCH, DELETE } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = 'http://localhost/api/user/strategies/s1'
const ctx = { params: Promise.resolve({ id: 's1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('PATCH /api/user/strategies/[id]', () => {
  const patch = (body: unknown) => jsonRequest(url, 'PATCH', body)

  it('requires a signed-in user', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await PATCH(patch({ name: 'x' }), ctx)).status).toBe(401)
  })

  it('updates the supplied fields and returns the row', async () => {
    const fake = setupDb({ update: [{ id: 's1', name: 'Renamed' }] })
    const res = await PATCH(
      patch({ name: 'Renamed', type: 'algo', status: 'active', riskLevel: 'low', config: { a: 1 } }),
      ctx,
    )
    expect(await res.json()).toEqual({ id: 's1', name: 'Renamed' })
    const set = (fake.calls.set[0] as any[])[0]
    expect(set).toMatchObject({ name: 'Renamed', type: 'algo', status: 'active', riskLevel: 'low', config: '{"a":1}' })
    expect(set.updatedAt).toBeInstanceOf(Date)
  })

  it('leaves unspecified fields out of the update', async () => {
    const fake = setupDb({ update: [{ id: 's1' }] })
    await PATCH(patch({ status: 'paused' }), ctx)
    const set = (fake.calls.set[0] as any[])[0]
    expect(Object.keys(set).sort()).toEqual(['status', 'updatedAt'])
  })

  it('passes performance metrics through', async () => {
    const fake = setupDb({ update: [{ id: 's1' }] })
    await PATCH(patch({ todayPnL: 12.5, winRate: 0.6 }), ctx)
    const set = (fake.calls.set[0] as any[])[0]
    expect(set).toMatchObject({ todayPnL: 12.5, winRate: 0.6 })
  })

  it('ignores columns the caller must not write', async () => {
    const fake = setupDb({ update: [{ id: 's1' }] })
    await PATCH(
      patch({
        name: 'ok',
        id: 'other',
        userId: 'victim',
        createdAt: 0,
        todayPnL: 'lots',
        winRate: Number.NaN,
        bogus: 1,
      }),
      ctx,
    )
    const set = (fake.calls.set[0] as any[])[0]
    expect(Object.keys(set).sort()).toEqual(['name', 'updatedAt'])
  })

  it('rejects a body that is not an object', async () => {
    setupDb()
    expect((await PATCH(patch([1]), ctx)).status).toBe(400)
    expect((await PATCH(patch(null), ctx)).status).toBe(400)
  })

  it('404s when the caller owns no such strategy', async () => {
    setupDb({ update: [] })
    const res = await PATCH(patch({ name: 'x' }), ctx)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Strategy not found' })
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    const res = await PATCH(patch({}), ctx)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})

describe('DELETE /api/user/strategies/[id]', () => {
  const del = () => jsonRequest(url, 'DELETE')

  it('requires a signed-in user', async () => {
    mockGetSession.mockResolvedValue({ user: null })
    setupDb()
    expect((await DELETE(del(), ctx)).status).toBe(401)
  })

  it('deletes the caller’s strategy', async () => {
    const fake = setupDb({ delete: [{ id: 's1' }] })
    expect(await (await DELETE(del(), ctx)).json()).toEqual({ success: true })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('404s when nothing was deleted', async () => {
    setupDb({ delete: [] })
    expect((await DELETE(del(), ctx)).status).toBe(404)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(del(), ctx)).status).toBe(500)
  })
})
