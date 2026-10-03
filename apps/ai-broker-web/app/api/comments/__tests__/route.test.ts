/**
 * @fileoverview Route tests for /api/comments: threaded listing, posting
 * (with reply notifications) and owner-only edit/delete.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET, POST, PATCH, DELETE } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = (qs = '') => `http://localhost/api/comments${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'Una', image: 'img.png' } })
})

describe('GET /api/comments', () => {
  it('requires itemType and itemId', async () => {
    setupDb()
    expect((await GET(jsonRequest(url('?itemType=signal'), 'GET'))).status).toBe(400)
  })

  it('nests replies under their parent and counts every comment', async () => {
    setupDb({
      select: [
        { id: 'r2', parentCommentId: 'c1', content: 'reply 2' },
        { id: 'r1', parentCommentId: 'c1', content: 'reply 1' },
        { id: 'c1', parentCommentId: null, content: 'root' },
        { id: 'c2', parentCommentId: null, content: 'other root' },
        { id: 'orphan', parentCommentId: 'missing', content: 'dropped' },
      ],
    })
    const body = await (await GET(jsonRequest(url('?itemType=signal&itemId=s1'), 'GET'))).json()
    expect(body.success).toBe(true)
    expect(body.total).toBe(5)
    expect(body.data.map((c: any) => c.id)).toEqual(['c1', 'c2'])
    expect(body.data[0].replies.map((c: any) => c.id)).toEqual(['r2', 'r1'])
    expect(body.data[1].replies).toEqual([])
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('boom') } })
    const res = await GET(jsonRequest(url('?itemType=signal&itemId=s1'), 'GET'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'boom' })
  })
})

describe('POST /api/comments', () => {
  const post = (body: unknown) => jsonRequest(url(), 'POST', body)
  const valid = { itemType: 'signal', itemId: 's1', content: 'hello' }

  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post(valid))).status).toBe(401)
  })

  it('validates required fields and the item type (comments cannot be commented on)', async () => {
    setupDb()
    expect((await POST(post({ itemType: 'signal', itemId: 's1' }))).status).toBe(400)
    const bad = await POST(post({ ...valid, itemType: 'comment' }))
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'Invalid item type' })
  })

  it('stores the comment and echoes the author', async () => {
    const fake = setupDb()
    const body = await (await POST(post(valid))).json()
    expect(body.data).toMatchObject({
      userId: 'u1',
      itemType: 'signal',
      itemId: 's1',
      content: 'hello',
      parentCommentId: null,
      userName: 'Una',
      userImage: 'img.png',
    })
    expect(fake.calls.insert).toHaveLength(1)
  })

  it('notifies the parent comment author on a reply', async () => {
    const fake = setupDb({ select: [{ id: 'p1', userId: 'author' }] })
    await POST(post({ ...valid, parentCommentId: 'p1' }))
    expect(fake.calls.insert).toHaveLength(2)
    expect((fake.calls.values.at(-1) as any[])[0]).toMatchObject({
      userId: 'author',
      type: 'comment',
      message: 'Una replied to your comment',
      relatedItemId: 's1',
    })
  })

  it('does not notify for a reply to your own or a missing comment', async () => {
    let fake = setupDb({ select: [{ id: 'p1', userId: 'u1' }] })
    await POST(post({ ...valid, parentCommentId: 'p1' }))
    expect(fake.calls.insert).toHaveLength(1)
    fake = setupDb({ select: [] })
    await POST(post({ ...valid, parentCommentId: 'gone' }))
    expect(fake.calls.insert).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    setupDb()
    Object.assign(db as object, { insert: () => { throw new Error('insert failed') } })
    const res = await POST(post(valid))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'insert failed' })
  })
})

describe('PATCH /api/comments', () => {
  const patch = (body: unknown) => jsonRequest(url(), 'PATCH', body)

  it('requires a session and both fields', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await PATCH(patch({ commentId: 'c1', content: 'x' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    expect((await PATCH(patch({ commentId: 'c1' }))).status).toBe(400)
  })

  it('404s for a missing comment and 403s for someone else’s', async () => {
    setupDb({ select: [] })
    expect((await PATCH(patch({ commentId: 'c1', content: 'x' }))).status).toBe(404)
    setupDb({ select: [{ id: 'c1', userId: 'someone-else' }] })
    const res = await PATCH(patch({ commentId: 'c1', content: 'x' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('lets the author edit and stamps editedAt', async () => {
    const fake = setupDb({ select: [{ id: 'c1', userId: 'u1' }] })
    const res = await PATCH(patch({ commentId: 'c1', content: 'edited' }))
    expect(await res.json()).toEqual({ success: true, message: 'Comment updated' })
    const set = (fake.calls.set[0] as any[])[0]
    expect(set.content).toBe('edited')
    expect(set.editedAt).toBeInstanceOf(Date)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await PATCH(patch({ commentId: 'c1', content: 'x' }))).status).toBe(500)
  })
})

describe('DELETE /api/comments', () => {
  const del = (qs = '?commentId=c1') => jsonRequest(url(qs), 'DELETE')

  it('requires a session and a commentId', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(del())).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    expect((await DELETE(del(''))).status).toBe(400)
  })

  it('404s, 403s, then deletes for the owner', async () => {
    setupDb({ select: [] })
    expect((await DELETE(del())).status).toBe(404)
    setupDb({ select: [{ id: 'c1', userId: 'other' }] })
    expect((await DELETE(del())).status).toBe(403)
    const fake = setupDb({ select: [{ id: 'c1', userId: 'u1' }] })
    const res = await DELETE(del())
    expect(await res.json()).toEqual({ success: true, message: 'Comment deleted' })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(del())).status).toBe(500)
  })
})
