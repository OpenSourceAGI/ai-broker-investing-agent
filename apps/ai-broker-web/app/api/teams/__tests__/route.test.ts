/**
 * @fileoverview Route tests for /api/teams: listing through organization
 * membership, and creation (including first-use personal organization and the
 * owner/admin guard).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET, POST } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = 'http://localhost/api/teams'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'Una' } })
})

describe('GET /api/teams', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url, 'GET'))).status).toBe(401)
  })

  it('returns an empty list for a user in no organization', async () => {
    const fake = setupDb({ select: [] })
    const body = await (await GET(jsonRequest(url, 'GET'))).json()
    expect(body).toEqual({ success: true, data: [] })
    expect(fake.calls['query.teams.findMany']).toBeUndefined()
  })

  it('loads the teams (with members) of every organization the user belongs to', async () => {
    const fake = setupDb({
      select: [{ organizationId: 'o1' }, { organizationId: 'o2' }],
      query: { teams: { findMany: [{ id: 't1', members: [] }] } },
    })
    const body = await (await GET(jsonRequest(url, 'GET'))).json()
    expect(body).toEqual({ success: true, data: [{ id: 't1', members: [] }] })
    expect(fake.calls['query.teams.findMany']).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    const res = await GET(jsonRequest(url, 'GET'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'db' })
  })
})

describe('POST /api/teams', () => {
  const post = (body: unknown) => jsonRequest(url, 'POST', body)

  it('requires a session and a name', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ name: 'T' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Name is required' })
  })

  it('creates the team in the given organization and makes the creator its lead', async () => {
    const fake = setupDb({ select: [{ role: 'admin' }] })
    const body = await (await POST(post({ organizationId: 'o1', name: 'Alpha', description: 'd', upgradeMembers: 1 }))).json()
    expect(body.data).toMatchObject({
      organizationId: 'o1',
      name: 'Alpha',
      description: 'd',
      upgradeMembers: true,
    })
    expect(fake.calls.insert).toHaveLength(2)
    expect((fake.calls.values[1] as any[])[0]).toMatchObject({ userId: 'u1', role: 'lead', teamId: body.data.id })
  })

  it('defaults description to null and upgradeMembers to false', async () => {
    setupDb({ select: [{ role: 'owner' }] })
    const body = await (await POST(post({ organizationId: 'o1', name: 'Beta' }))).json()
    expect(body.data.description).toBeNull()
    expect(body.data.upgradeMembers).toBe(false)
  })

  it.each(['member', 'viewer'])('forbids a %s from creating teams', async (role) => {
    setupDb({ select: [{ role }] })
    const res = await POST(post({ organizationId: 'o1', name: 'X' }))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('forbids non-members', async () => {
    setupDb({ select: [] })
    expect((await POST(post({ organizationId: 'o1', name: 'X' }))).status).toBe(403)
  })

  it('reuses the organization the caller already owns when none is given', async () => {
    const fake = setupDb({
      select: (i) => (i === 0 ? [{ organizationId: 'owned', role: 'owner' }] : [{ role: 'owner' }]),
    })
    const body = await (await POST(post({ name: 'Gamma' }))).json()
    expect(body.data.organizationId).toBe('owned')
    expect(fake.calls.insert).toHaveLength(2) // team + lead only
  })

  it('creates a personal organization on first use', async () => {
    const fake = setupDb({ select: (i) => (i === 0 ? [] : [{ role: 'owner' }]) })
    const body = await (await POST(post({ name: 'Delta' }))).json()
    expect(fake.calls.insert).toHaveLength(4) // org, org member, team, lead
    const org = (fake.calls.values[0] as any[])[0]
    expect(org).toMatchObject({ name: "Una's Organization", ownerId: 'u1' })
    expect((fake.calls.values[1] as any[])[0]).toMatchObject({ role: 'owner', userId: 'u1', organizationId: org.id })
    expect(body.data.organizationId).toBe(org.id)
  })

  it('falls back to a generic organization name for anonymous-name users', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const fake = setupDb({ select: (i) => (i === 0 ? [] : [{ role: 'owner' }]) })
    await POST(post({ name: 'Epsilon' }))
    expect((fake.calls.values[0] as any[])[0].name).toBe('My Organization')
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post({ name: 'T' }))).status).toBe(500)
  })
})
