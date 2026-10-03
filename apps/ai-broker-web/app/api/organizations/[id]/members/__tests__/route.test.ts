/**
 * @fileoverview Route tests for /api/organizations/[id]/members.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../../../__tests__/helpers/fake-db'
import { POST, DELETE } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const ctx = { params: { id: 'o1' } }
const rows = (...results: unknown[][]) => (i: number) => results[i] ?? []
const post = (body: unknown) => jsonRequest('http://localhost/api/organizations/o1/members', 'POST', body)
const del = (qs = '?userId=u2') => jsonRequest(`http://localhost/api/organizations/o1/members${qs}`, 'DELETE')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('POST /api/organizations/[id]/members', () => {
  it('requires a session and owner/admin membership', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ userId: 'u2' }), ctx)).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    setupDb({ select: [] })
    expect((await POST(post({ userId: 'u2' }), ctx)).status).toBe(403)
    setupDb({ select: [{ role: 'member' }] })
    expect((await POST(post({ userId: 'u2' }), ctx)).status).toBe(403)
  })

  it('requires a userId, an existing user and no prior membership', async () => {
    setupDb({ select: rows([{ role: 'owner' }]) })
    let res = await POST(post({}), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'User ID is required' })

    setupDb({ select: rows([{ role: 'owner' }], []) })
    res = await POST(post({ userId: 'ghost' }), ctx)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'User not found' })

    setupDb({ select: rows([{ role: 'owner' }], [{ id: 'u2' }], [{ id: 'm' }]) })
    res = await POST(post({ userId: 'u2' }), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'User is already a member' })
  })

  it('adds the member with the default or an explicit role', async () => {
    let fake = setupDb({ select: rows([{ role: 'admin' }], [{ id: 'u2' }], []) })
    let body = await (await POST(post({ userId: 'u2' }), ctx)).json()
    expect(body.data).toMatchObject({ organizationId: 'o1', userId: 'u2', role: 'member' })
    expect(fake.calls.insert).toHaveLength(1)

    fake = setupDb({ select: rows([{ role: 'owner' }], [{ id: 'u2' }], []) })
    body = await (await POST(post({ userId: 'u2', role: 'admin' }), ctx)).json()
    expect(body.data.role).toBe('admin')
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post({ userId: 'u2' }), ctx)).status).toBe(500)
  })
})

describe('DELETE /api/organizations/[id]/members', () => {
  it('requires a session, a userId and owner/admin membership', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(del(), ctx)).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    expect((await DELETE(del(''), ctx)).status).toBe(400)
    setupDb({ select: [{ role: 'member' }] })
    expect((await DELETE(del(), ctx)).status).toBe(403)
    setupDb({ select: [] })
    expect((await DELETE(del(), ctx)).status).toBe(403)
  })

  it('removes the member', async () => {
    const fake = setupDb({ select: [{ role: 'admin' }] })
    const res = await DELETE(del(), ctx)
    expect(await res.json()).toEqual({ success: true, message: 'Member removed' })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(del(), ctx)).status).toBe(500)
  })
})
