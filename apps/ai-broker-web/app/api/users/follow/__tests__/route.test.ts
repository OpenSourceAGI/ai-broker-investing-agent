/**
 * @fileoverview Route tests for /api/users/follow.
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

const url = (qs = '') => `http://localhost/api/users/follow${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'me', name: 'Me' } })
})

describe('GET /api/users/follow', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(401)
  })

  it('lists followers when type=followers', async () => {
    setupDb({ select: [{ userId: 'a' }] })
    const body = await (await GET(jsonRequest(url('?type=followers&userId=other'), 'GET'))).json()
    expect(body).toEqual({ success: true, data: [{ userId: 'a' }] })
  })

  it('lists who the user follows otherwise, defaulting to the caller', async () => {
    const fake = setupDb({ select: [{ userId: 'b' }] })
    const body = await (await GET(jsonRequest(url(), 'GET'))).json()
    expect(body.data).toEqual([{ userId: 'b' }])
    expect(fake.calls.innerJoin).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(500)
  })
})

describe('POST /api/users/follow', () => {
  const post = (body: unknown) => jsonRequest(url(), 'POST', body)

  it('requires a session and a userId', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ userId: 'x' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'me' } })
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'User ID is required' })
  })

  it('refuses to follow yourself', async () => {
    setupDb()
    const res = await POST(post({ userId: 'me' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Cannot follow yourself' })
  })

  it('404s for an unknown user and 400s for a duplicate', async () => {
    setupDb({ select: [] })
    expect((await POST(post({ userId: 'ghost' }))).status).toBe(404)
    setupDb({ select: (i) => (i === 0 ? [{ id: 'target' }] : [{ id: 'f1' }]) })
    const res = await POST(post({ userId: 'target' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Already following this user' })
  })

  it('creates the follow and notifies the target', async () => {
    const fake = setupDb({ select: (i) => (i === 0 ? [{ id: 'target' }] : []) })
    const body = await (await POST(post({ userId: 'target' }))).json()
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ followerId: 'me', followingId: 'target' })
    expect(fake.calls.insert).toHaveLength(2)
    expect((fake.calls.values[1] as any[])[0]).toMatchObject({
      userId: 'target',
      type: 'follow',
      title: 'New Follower',
      message: 'Me started following you',
      fromUserId: 'me',
    })
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post({ userId: 'x' }))).status).toBe(500)
  })
})

describe('DELETE /api/users/follow', () => {
  const del = (qs = '?userId=target') => jsonRequest(url(qs), 'DELETE')

  it('requires a session and a userId', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(del())).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'me' } })
    expect((await DELETE(del(''))).status).toBe(400)
  })

  it('unfollows', async () => {
    const fake = setupDb()
    const res = await DELETE(del())
    expect(await res.json()).toEqual({ success: true, message: 'Unfollowed user' })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(del())).status).toBe(500)
  })
})
