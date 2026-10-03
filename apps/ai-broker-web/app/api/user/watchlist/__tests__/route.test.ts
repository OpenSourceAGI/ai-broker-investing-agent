/**
 * @fileoverview Route tests for /api/user/watchlist (symbols within a list, or
 * the default list when no listId is given).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../../__tests__/helpers/fake-db'
import { GET, POST, DELETE } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = (qs = '') => `http://localhost/api/user/watchlist${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/user/watchlist', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(401)
  })

  it('returns items for the default list or a given list', async () => {
    const fake = setupDb({ select: [{ symbol: 'AAPL' }] })
    expect(await (await GET(jsonRequest(url(), 'GET'))).json()).toEqual({ success: true, data: [{ symbol: 'AAPL' }] })
    await GET(jsonRequest(url('?listId=l1'), 'GET'))
    expect(fake.calls.where).toHaveLength(2)
    expect(fake.calls.orderBy).toHaveLength(2)
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(500)
  })
})

describe('POST /api/user/watchlist', () => {
  const post = (body: unknown) => jsonRequest(url(), 'POST', body)

  it('requires a session and a symbol', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ symbol: 'aapl' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Symbol is required' })
  })

  it('rejects a symbol that is already in the list', async () => {
    setupDb({ select: [{ id: 'x' }] })
    const res = await POST(post({ symbol: 'aapl' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Symbol already in watchlist' })
  })

  it('stores the symbol upper-cased, in the default list unless a listId is given', async () => {
    let fake = setupDb({ select: [] })
    let body = await (await POST(post({ symbol: 'aapl', name: 'Apple' }))).json()
    expect(body.data).toMatchObject({ userId: 'u1', symbol: 'AAPL', name: 'Apple', watchlistId: null })
    expect(fake.calls.insert).toHaveLength(1)

    fake = setupDb({ select: [] })
    body = await (await POST(post({ symbol: 'msft', listId: 'l1' }))).json()
    expect(body.data).toMatchObject({ symbol: 'MSFT', watchlistId: 'l1', name: null })
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post({ symbol: 'a' }))).status).toBe(500)
  })
})

describe('DELETE /api/user/watchlist', () => {
  it('requires a session and a symbol', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(jsonRequest(url('?symbol=aapl'), 'DELETE'))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await DELETE(jsonRequest(url(), 'DELETE'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Symbol is required' })
  })

  it('removes the symbol from the default list or a given list', async () => {
    const fake = setupDb()
    const res = await DELETE(jsonRequest(url('?symbol=aapl'), 'DELETE'))
    expect(await res.json()).toEqual({ success: true, message: 'Symbol removed from watchlist' })
    await DELETE(jsonRequest(url('?symbol=aapl&listId=l1'), 'DELETE'))
    expect(fake.calls.delete).toHaveLength(2)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(jsonRequest(url('?symbol=a'), 'DELETE'))).status).toBe(500)
  })
})
