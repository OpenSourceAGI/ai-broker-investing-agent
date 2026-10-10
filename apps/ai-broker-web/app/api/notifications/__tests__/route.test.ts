/**
 * @fileoverview Route tests for /api/notifications: listing with an unread
 * filter, mark-as-read (one/all) and delete (one/all-read).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET, PATCH, DELETE } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = (qs = '') => `http://localhost/api/notifications${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/notifications', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(401)
  })

  it('returns the list and the unread count', async () => {
    const fake = setupDb({
      select: (i) => (i === 0 ? [{ id: 'n1' }, { id: 'n2' }] : [{ count: 'a' }, { count: 'b' }, { count: 'c' }]),
    })
    const body = await (await GET(jsonRequest(url(), 'GET'))).json()
    expect(body).toEqual({ success: true, data: [{ id: 'n1' }, { id: 'n2' }], unreadCount: 3 })
    // Default page size of 50.
    expect(fake.calls.limit[0]).toEqual([50])
  })

  it('honours limit and unreadOnly', async () => {
    const fake = setupDb({ select: [] })
    await GET(jsonRequest(url('?limit=5&unreadOnly=true'), 'GET'))
    expect(fake.calls.limit[0]).toEqual([5])
    expect(fake.calls.where).toHaveLength(2)
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    const res = await GET(jsonRequest(url(), 'GET'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'db' })
  })
})

describe('PATCH /api/notifications', () => {
  const patch = (body: unknown) => jsonRequest(url(), 'PATCH', body)

  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await PATCH(patch({ markAllAsRead: true }))).status).toBe(401)
  })

  it('marks everything read', async () => {
    const fake = setupDb()
    const res = await PATCH(patch({ markAllAsRead: true }))
    expect(await res.json()).toEqual({ success: true, message: 'All notifications marked as read' })
    expect((fake.calls.set[0] as any[])[0]).toEqual({ read: true })
  })

  it('marks one read', async () => {
    const fake = setupDb()
    const res = await PATCH(patch({ notificationId: 'n1' }))
    expect(await res.json()).toEqual({ success: true, message: 'Notification marked as read' })
    expect(fake.calls.update).toHaveLength(1)
  })

  it('needs one of the two options', async () => {
    setupDb()
    const res = await PATCH(patch({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Either notificationId or markAllAsRead is required' })
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await PATCH(patch({ markAllAsRead: true }))).status).toBe(500)
  })
})

describe('DELETE /api/notifications', () => {
  const del = (qs = '') => jsonRequest(url(qs), 'DELETE')

  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(del('?deleteAll=true'))).status).toBe(401)
  })

  it('deletes all read notifications', async () => {
    const fake = setupDb()
    const res = await DELETE(del('?deleteAll=true'))
    expect(await res.json()).toEqual({ success: true, message: 'All read notifications deleted' })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('deletes one notification', async () => {
    const fake = setupDb()
    const res = await DELETE(del('?notificationId=n1'))
    expect(await res.json()).toEqual({ success: true, message: 'Notification deleted' })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('needs one of the two options', async () => {
    setupDb()
    const res = await DELETE(del())
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Either notificationId or deleteAll is required' })
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(del('?deleteAll=true'))).status).toBe(500)
  })
})
