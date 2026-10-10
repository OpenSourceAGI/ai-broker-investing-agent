/**
 * @fileoverview Route tests for /api/teams/[id]: member-only read, and the
 * org-admin / team-lead guards on update and delete.
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

const url = 'http://localhost/api/teams/t1'
const ctx = { params: { id: 't1' } }
const TEAM = { id: 't1', organizationId: 'o1', name: 'Alpha' }

/** select() results in call order. */
const rows = (...results: unknown[][]) => (i: number) => results[i] ?? []

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/teams/[id]', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url, 'GET'), ctx)).status).toBe(401)
  })

  it('404s for an unknown team', async () => {
    setupDb({ select: [] })
    expect((await GET(jsonRequest(url, 'GET'), ctx)).status).toBe(404)
  })

  it('403s for someone outside the organization', async () => {
    setupDb({ select: rows([TEAM], []) })
    expect((await GET(jsonRequest(url, 'GET'), ctx)).status).toBe(403)
  })

  it('returns the team with its members for an organization member', async () => {
    setupDb({ select: rows([TEAM], [{ role: 'member' }], [{ userId: 'a' }, { userId: 'b' }]) })
    const body = await (await GET(jsonRequest(url, 'GET'), ctx)).json()
    expect(body).toEqual({ success: true, data: { ...TEAM, members: [{ userId: 'a' }, { userId: 'b' }] } })
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await GET(jsonRequest(url, 'GET'), ctx)).status).toBe(500)
  })
})

describe('PATCH /api/teams/[id]', () => {
  const patch = (body: unknown) => jsonRequest(url, 'PATCH', body)

  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await PATCH(patch({}), ctx)).status).toBe(401)
  })

  it('404s for an unknown team', async () => {
    setupDb({ select: [] })
    expect((await PATCH(patch({}), ctx)).status).toBe(404)
  })

  it('forbids plain members and outsiders', async () => {
    setupDb({ select: rows([TEAM], [{ role: 'member' }], [{ role: 'member' }]) })
    expect((await PATCH(patch({ name: 'x' }), ctx)).status).toBe(403)
    setupDb({ select: rows([TEAM], [], []) })
    expect((await PATCH(patch({ name: 'x' }), ctx)).status).toBe(403)
  })

  it.each(['owner', 'admin'])('lets an organization %s update the team', async (role) => {
    const fake = setupDb({ select: rows([TEAM], [{ role }], []) })
    const res = await PATCH(patch({ name: 'New', description: 'D', upgradeMembers: 0 }), ctx)
    expect(await res.json()).toEqual({ success: true, message: 'Team updated' })
    const set = (fake.calls.set[0] as any[])[0]
    expect(set).toMatchObject({ name: 'New', description: 'D', upgradeMembers: false })
    expect(set.updatedAt).toBeInstanceOf(Date)
  })

  it('lets a team lead update, changing only the fields supplied', async () => {
    const fake = setupDb({ select: rows([TEAM], [{ role: 'member' }], [{ role: 'lead' }]) })
    await PATCH(patch({ description: 'only' }), ctx)
    const set = (fake.calls.set[0] as any[])[0]
    expect(Object.keys(set).sort()).toEqual(['description', 'updatedAt'])
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await PATCH(patch({}), ctx)).status).toBe(500)
  })
})

describe('DELETE /api/teams/[id]', () => {
  const del = () => jsonRequest(url, 'DELETE')

  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await DELETE(del(), ctx)).status).toBe(401)
  })

  it('404s for an unknown team', async () => {
    setupDb({ select: [] })
    expect((await DELETE(del(), ctx)).status).toBe(404)
  })

  it('forbids anyone but an organization owner/admin (even a team lead)', async () => {
    setupDb({ select: rows([TEAM], [{ role: 'member' }]) })
    expect((await DELETE(del(), ctx)).status).toBe(403)
    setupDb({ select: rows([TEAM], []) })
    expect((await DELETE(del(), ctx)).status).toBe(403)
  })

  it('deletes for an organization admin', async () => {
    const fake = setupDb({ select: rows([TEAM], [{ role: 'admin' }]) })
    const res = await DELETE(del(), ctx)
    expect(await res.json()).toEqual({ success: true, message: 'Team deleted' })
    expect(fake.calls.delete).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await DELETE(del(), ctx)).status).toBe(500)
  })
})
