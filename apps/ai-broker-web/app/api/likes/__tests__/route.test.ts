/**
 * @fileoverview Route tests for /api/likes: counting, liking (with the
 * duplicate guard and comment-owner notification) and unliking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET, POST, DELETE } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = (qs = '') => `http://localhost/api/likes${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'Una' } })
})

describe('GET /api/likes', () => {
  it('requires itemType and itemId', async () => {
    setupDb()
    const res = await GET(jsonRequest(url('?itemType=signal'), 'GET'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'itemType and itemId are required' })
  })

  it('returns the count and whether the signed-in user liked it', async () => {
    setupDb({ select: (i) => (i === 0 ? [{ count: 7 }] : [{ id: 'like-1' }]) })
    const res = await GET(jsonRequest(url('?itemType=signal&itemId=s1'), 'GET'))
    expect(await res.json()).toEqual({ success: true, data: { count: 7, userLiked: true } })
  })

  it('reports userLiked=false when the user has no like row', async () => {
    setupDb({ select: (i) => (i === 0 ? [{ count: 2 }] : []) })
    const body = await (await GET(jsonRequest(url('?itemType=signal&itemId=s1'), 'GET'))).json()
    expect(body.data).toEqual({ count: 2, userLiked: false })
  })

  it('works for signed-out visitors and defaults an empty count to 0', async () => {
    mockGetSession.mockResolvedValue(null)
    const fake = setupDb({ select: [] })
    const body = await (await GET(jsonRequest(url('?itemType=signal&itemId=s1'), 'GET'))).json()
    expect(body.data).toEqual({ count: 0, userLiked: false })
    expect(fake.calls.select).toHaveLength(1)
  })

  it('answers 500 with the error message when the database fails', async () => {
    Object.assign(db as object, {
      select: () => {
        throw new Error('db down')
      },
    })
    const res = await GET(jsonRequest(url('?itemType=signal&itemId=s1'), 'GET'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'db down' })
  })
})

describe('POST /api/likes', () => {
  const post = (body: unknown) => jsonRequest(url(), 'POST', body)

  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ itemType: 'signal', itemId: 's1' }))).status).toBe(401)
  })

  it('requires both fields and a known item type', async () => {
    setupDb()
    expect((await POST(post({ itemType: 'signal' }))).status).toBe(400)
    const bad = await POST(post({ itemType: 'bogus', itemId: 'x' }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'Invalid item type' })
  })

  it.each(['debate_report', 'news_tip', 'signal', 'strategy', 'comment'])('accepts %s', async (type) => {
    setupDb({ select: [] })
    const res = await POST(post({ itemType: type, itemId: 'x' }))
    expect(res.status).toBe(200)
  })

  it('rejects a duplicate like', async () => {
    setupDb({ select: [{ id: 'existing' }] })
    const res = await POST(post({ itemType: 'signal', itemId: 's1' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Already liked this item' })
  })

  it('stores the like and returns the refreshed count', async () => {
    const fake = setupDb({ select: (i) => (i === 0 ? [] : [{ count: 3 }]) })
    const res = await POST(post({ itemType: 'signal', itemId: 's1' }))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ userId: 'u1', itemType: 'signal', itemId: 's1', count: 3 })
    expect(typeof body.data.id).toBe('string')
    expect(fake.calls.insert).toHaveLength(1)
  })

  it("notifies a comment's author when someone else likes it", async () => {
    const fake = setupDb({
      select: (i) => (i === 0 ? [] : i === 1 ? [{ id: 'c1', userId: 'author' }] : [{ count: 1 }]),
    })
    await POST(post({ itemType: 'comment', itemId: 'c1' }))
    expect(fake.calls.insert).toHaveLength(2)
    const notification = (fake.calls.values.at(-1) as any[])[0]
    expect(notification).toMatchObject({
      userId: 'author',
      type: 'like',
      fromUserId: 'u1',
      message: 'Una liked your comment',
      read: false,
    })
  })

  it('does not notify when liking your own comment or a missing one', async () => {
    let fake = setupDb({
      select: (i) => (i === 0 ? [] : i === 1 ? [{ id: 'c1', userId: 'u1' }] : [{ count: 1 }]),
    })
    await POST(post({ itemType: 'comment', itemId: 'c1' }))
    expect(fake.calls.insert).toHaveLength(1)

    fake = setupDb({ select: (i) => (i === 2 ? [{ count: 1 }] : []) })
    await POST(post({ itemType: 'comment', itemId: 'gone' }))
    expect(fake.calls.insert).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('auth down'))
    const res = await POST(post({ itemType: 'signal', itemId: 's1' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'auth down' })
  })
})

describe('DELETE /api/likes', () => {
  const del = (qs = '?itemType=signal&itemId=s1') => jsonRequest(url(qs), 'DELETE')

  it('requires a session and both params', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(del())).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    expect((await DELETE(del('?itemType=signal'))).status).toBe(400)
  })

  it('removes the like and returns the new count', async () => {
    const fake = setupDb({ select: [{ count: 4 }] })
    const res = await DELETE(del())
    expect(await res.json()).toEqual({ success: true, message: 'Item unliked', data: { count: 4 } })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('defaults an empty count to 0 and answers 500 on failure', async () => {
    setupDb({ select: [] })
    expect((await (await DELETE(del())).json()).data.count).toBe(0)
    Object.assign(db as object, {
      delete: () => {
        throw new Error('nope')
      },
    })
    const res = await DELETE(del())
    expect(res.status).toBe(500)
  })
})
