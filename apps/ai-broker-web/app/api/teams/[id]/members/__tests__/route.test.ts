/**
 * @fileoverview Route tests for /api/teams/[id]/members: add and remove, both
 * restricted to organization owners/admins and the team's leads.
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

const ctx = { params: { id: 't1' } }
const TEAM = { id: 't1', organizationId: 'o1' }
const rows = (...results: unknown[][]) => (i: number) => results[i] ?? []
const post = (body: unknown) => jsonRequest('http://localhost/api/teams/t1/members', 'POST', body)
const del = (qs = '?userId=u2') => jsonRequest(`http://localhost/api/teams/t1/members${qs}`, 'DELETE')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('POST /api/teams/[id]/members', () => {
  it('requires a session and an existing team', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ userId: 'u2' }), ctx)).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    setupDb({ select: [] })
    expect((await POST(post({ userId: 'u2' }), ctx)).status).toBe(404)
  })

  it('forbids anyone who is neither an org admin nor a team lead', async () => {
    setupDb({ select: rows([TEAM], [{ role: 'member' }], [{ role: 'member' }]) })
    const res = await POST(post({ userId: 'u2' }), ctx)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('requires a userId', async () => {
    setupDb({ select: rows([TEAM], [{ role: 'owner' }], []) })
    const res = await POST(post({}), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'User ID is required' })
  })

  it('requires the user to be in the organization first', async () => {
    setupDb({ select: rows([TEAM], [{ role: 'owner' }], [], []) })
    const res = await POST(post({ userId: 'u2' }), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'User must be in the organization first' })
  })

  it('rejects someone already on the team', async () => {
    setupDb({ select: rows([TEAM], [{ role: 'owner' }], [], [{ role: 'member' }], [{ id: 'tm' }]) })
    const res = await POST(post({ userId: 'u2' }), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'User is already a team member' })
  })

  it('adds the member (default role "member") for an org admin', async () => {
    const fake = setupDb({ select: rows([TEAM], [{ role: 'admin' }], [], [{ role: 'member' }], []) })
    const body = await (await POST(post({ userId: 'u2' }), ctx)).json()
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ teamId: 't1', userId: 'u2', role: 'member' })
    expect(fake.calls.insert).toHaveLength(1)
  })

  it('lets a team lead add a member with an explicit role', async () => {
    setupDb({ select: rows([TEAM], [], [{ role: 'lead' }], [{ role: 'member' }], []) })
    const body = await (await POST(post({ userId: 'u2', role: 'lead' }), ctx)).json()
    expect(body.data.role).toBe('lead')
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post({ userId: 'u2' }), ctx)).status).toBe(500)
  })
})

describe('DELETE /api/teams/[id]/members', () => {
  it('requires a session, a userId and an existing team', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(del(), ctx)).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    expect((await DELETE(del(''), ctx)).status).toBe(400)
    setupDb({ select: [] })
    expect((await DELETE(del(), ctx)).status).toBe(404)
  })

  it('forbids plain members', async () => {
    setupDb({ select: rows([TEAM], [{ role: 'member' }], [{ role: 'member' }]) })
    expect((await DELETE(del(), ctx)).status).toBe(403)
  })

  it('removes the member for an org owner or a team lead', async () => {
    let fake = setupDb({ select: rows([TEAM], [{ role: 'owner' }], []) })
    const res = await DELETE(del(), ctx)
    expect(await res.json()).toEqual({ success: true, message: 'Team member removed' })
    expect(fake.calls.delete).toHaveLength(1)

    fake = setupDb({ select: rows([TEAM], [], [{ role: 'lead' }]) })
    await DELETE(del(), ctx)
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(del(), ctx)).status).toBe(500)
  })
})
