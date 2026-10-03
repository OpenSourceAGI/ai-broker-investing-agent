/**
 * @fileoverview Route tests for /api/user/strategies (list / create).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../../__tests__/helpers/fake-db'
import { GET, POST } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = 'http://localhost/api/user/strategies'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/user/strategies', () => {
  it('requires a signed-in user', async () => {
    mockGetSession.mockResolvedValue({ user: null })
    setupDb()
    expect((await GET(jsonRequest(url, 'GET'))).status).toBe(401)
  })

  it('returns the caller’s strategies as a bare array', async () => {
    setupDb({ select: [{ id: 's1' }, { id: 's2' }] })
    expect(await (await GET(jsonRequest(url, 'GET'))).json()).toEqual([{ id: 's1' }, { id: 's2' }])
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    const res = await GET(jsonRequest(url, 'GET'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})

describe('POST /api/user/strategies', () => {
  const post = (body: unknown) => jsonRequest(url, 'POST', body)

  it('requires a signed-in user', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ name: 'S' }))).status).toBe(401)
  })

  it('creates a paused strategy with a medium risk default and serialises config', async () => {
    const fake = setupDb({ insert: [{ id: 'new' }] })
    const res = await POST(post({ name: 'Mean reversion', type: 'algo', config: { lookback: 20 } }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'new' })
    const values = (fake.calls.values[0] as any[])[0]
    expect(values).toMatchObject({
      userId: 'u1',
      name: 'Mean reversion',
      type: 'algo',
      riskLevel: 'medium',
      status: 'paused',
      config: '{"lookback":20}',
    })
  })

  it('honours an explicit risk level and stores null config when none is given', async () => {
    const fake = setupDb({ insert: [{ id: 'new' }] })
    await POST(post({ name: 'S', type: 'algo', riskLevel: 'high' }))
    const values = (fake.calls.values[0] as any[])[0]
    expect(values.riskLevel).toBe('high')
    expect(values.config).toBeNull()
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post({ name: 'S' }))).status).toBe(500)
  })
})
