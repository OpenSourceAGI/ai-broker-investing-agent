/**
 * @fileoverview Route tests for /api/organizations/[id].
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../../__tests__/helpers/fake-db'
import { GET, PATCH, DELETE } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = 'http://localhost/api/organizations/o1'
const ctx = { params: { id: 'o1' } }
const rows = (...results: unknown[][]) => (i: number) => results[i] ?? []

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/organizations/[id]', () => {
  it('requires a session and membership', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url, 'GET'), ctx)).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    setupDb({ select: [] })
    expect((await GET(jsonRequest(url, 'GET'), ctx)).status).toBe(403)
  })

  it('404s when the organization row is missing', async () => {
    setupDb({ select: rows([{ role: 'member' }], []) })
    const res = await GET(jsonRequest(url, 'GET'), ctx)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Organization not found' })
  })

  it('returns the organization with members, teams and the caller’s role', async () => {
    setupDb({
      select: rows([{ role: 'admin' }], [{ id: 'o1', name: 'Acme' }], [{ userId: 'a' }], [{ id: 't1' }]),
    })
    const body = await (await GET(jsonRequest(url, 'GET'), ctx)).json()
    expect(body).toEqual({
      success: true,
      data: { id: 'o1', name: 'Acme', members: [{ userId: 'a' }], teams: [{ id: 't1' }], userRole: 'admin' },
    })
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await GET(jsonRequest(url, 'GET'), ctx)).status).toBe(500)
  })
})

describe('PATCH /api/organizations/[id]', () => {
  const patch = (body: unknown) => jsonRequest(url, 'PATCH', body)

  it('requires a session, and owner/admin membership', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await PATCH(patch({}), ctx)).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    setupDb({ select: [] })
    expect((await PATCH(patch({ name: 'x' }), ctx)).status).toBe(403)
    setupDb({ select: [{ role: 'member' }] })
    expect((await PATCH(patch({ name: 'x' }), ctx)).status).toBe(403)
  })

  it.each(['owner', 'admin'])('lets an %s update the details', async (role) => {
    const fake = setupDb({ select: [{ role }] })
    const res = await PATCH(patch({ name: 'New', description: 'D', image: 'i' }), ctx)
    expect(await res.json()).toEqual({ success: true, message: 'Organization updated' })
    const set = (fake.calls.set[0] as any[])[0]
    expect(set).toMatchObject({ name: 'New', description: 'D', image: 'i' })
    expect(set.updatedAt).toBeInstanceOf(Date)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await PATCH(patch({}), ctx)).status).toBe(500)
  })
})

describe('DELETE /api/organizations/[id]', () => {
  const del = () => jsonRequest(url, 'DELETE')

  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(del(), ctx)).status).toBe(401)
  })

  it('404s for unknown organizations and 403s for non-owners (even admins)', async () => {
    setupDb({ select: [] })
    expect((await DELETE(del(), ctx)).status).toBe(404)
    setupDb({ select: [{ id: 'o1', ownerId: 'someone-else' }] })
    const res = await DELETE(del(), ctx)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('deletes for the owner', async () => {
    const fake = setupDb({ select: [{ id: 'o1', ownerId: 'u1' }] })
    const res = await DELETE(del(), ctx)
    expect(await res.json()).toEqual({ success: true, message: 'Organization deleted' })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(del(), ctx)).status).toBe(500)
  })
})
