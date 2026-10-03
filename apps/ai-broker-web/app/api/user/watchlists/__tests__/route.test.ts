/**
 * @fileoverview Route tests for /api/user/watchlists (list / create / delete / rename).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../../__tests__/helpers/fake-db'
import { GET, POST, DELETE, PATCH } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = (qs = '') => `http://localhost/api/user/watchlists${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/user/watchlists', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(401)
  })

  it('lists the user’s watchlists', async () => {
    const fake = setupDb({ select: [{ id: 'w1' }] })
    expect(await (await GET(jsonRequest(url(), 'GET'))).json()).toEqual({ success: true, data: [{ id: 'w1' }] })
    expect(fake.calls.orderBy).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(500)
  })
})

describe('POST /api/user/watchlists', () => {
  const post = (body: unknown) => jsonRequest(url(), 'POST', body)

  it('requires a session and a name', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ name: 'Tech' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Name is required' })
  })

  it('creates a watchlist for the caller', async () => {
    const fake = setupDb()
    const body = await (await POST(post({ name: 'Tech', description: 'big caps' }))).json()
    expect(body.data).toMatchObject({ userId: 'u1', name: 'Tech', description: 'big caps' })
    expect(typeof body.data.id).toBe('string')
    expect(fake.calls.insert).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post({ name: 'T' }))).status).toBe(500)
  })
})

describe('DELETE /api/user/watchlists', () => {
  it('requires a session and an id', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(jsonRequest(url('?id=w1'), 'DELETE'))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await DELETE(jsonRequest(url(), 'DELETE'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'List ID is required' })
  })

  it('deletes only the caller’s list', async () => {
    const fake = setupDb()
    const res = await DELETE(jsonRequest(url('?id=w1'), 'DELETE'))
    expect(await res.json()).toEqual({ success: true, message: 'Watchlist deleted' })
    expect(fake.calls.delete).toHaveLength(1)
    expect(fake.calls.where).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(jsonRequest(url('?id=w1'), 'DELETE'))).status).toBe(500)
  })
})

describe('PATCH /api/user/watchlists', () => {
  const patch = (body: unknown) => jsonRequest(url(), 'PATCH', body)

  it('requires a session, an id and a name', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await PATCH(patch({ id: 'w1', name: 'N' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await PATCH(patch({ id: 'w1' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'ID and Name are required' })
  })

  it('renames and returns the updated row', async () => {
    const fake = setupDb({ select: [{ id: 'w1', name: 'New' }] })
    const body = await (await PATCH(patch({ id: 'w1', name: 'New' }))).json()
    expect(body).toEqual({ success: true, data: { id: 'w1', name: 'New' } })
    const set = (fake.calls.set[0] as any[])[0]
    expect(set.name).toBe('New')
    expect(set.updatedAt).toBeInstanceOf(Date)
    expect(fake.calls.get).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await PATCH(patch({ id: 'w1', name: 'N' }))).status).toBe(500)
  })
})
