/**
 * @fileoverview Route tests for /api/user/signals (list / create).
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

const url = 'http://localhost/api/user/signals'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/user/signals', () => {
  it('requires a signed-in user', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url, 'GET'))).status).toBe(401)
  })

  it('returns the caller’s signals as a bare array', async () => {
    setupDb({ select: [{ id: 'sig1' }] })
    expect(await (await GET(jsonRequest(url, 'GET'))).json()).toEqual([{ id: 'sig1' }])
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    const res = await GET(jsonRequest(url, 'GET'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})

describe('POST /api/user/signals', () => {
  const post = (body: unknown) => jsonRequest(url, 'POST', body)
  const signal = {
    asset: 'AAPL',
    type: 'buy',
    combinedScore: 72,
    scoreLabel: 'Bullish',
    fundamentalsScore: 70,
    vixScore: 60,
    technicalScore: 80,
    sentimentScore: 65,
    strategy: 'momentum',
    timeframe: '1d',
    suggestedAction: 'BUY',
    suggestedSize: 5,
  }

  it('requires a signed-in user', async () => {
    mockGetSession.mockResolvedValue({ user: null })
    setupDb()
    expect((await POST(post(signal))).status).toBe(401)
  })

  it('stores every score for the caller and serialises metadata', async () => {
    const fake = setupDb({ insert: [{ id: 'new' }] })
    const res = await POST(post({ ...signal, metadata: { source: 'agent' } }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'new' })
    const values = (fake.calls.values[0] as any[])[0]
    expect(values).toMatchObject({ ...signal, userId: 'u1', metadata: '{"source":"agent"}' })
    expect(values.createdAt).toBeInstanceOf(Date)
  })

  it('stores null metadata when none is supplied', async () => {
    const fake = setupDb({ insert: [{ id: 'new' }] })
    await POST(post(signal))
    expect((fake.calls.values[0] as any[])[0].metadata).toBeNull()
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post(signal))).status).toBe(500)
  })
})
