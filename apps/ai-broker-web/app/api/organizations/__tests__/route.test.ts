/**
 * @fileoverview Route tests for /api/organizations (list / create).
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

const url = 'http://localhost/api/organizations'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/organizations', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url, 'GET'))).status).toBe(401)
  })

  it("lists the user's organizations with their role", async () => {
    const fake = setupDb({ select: [{ id: 'o1', role: 'owner' }] })
    const body = await (await GET(jsonRequest(url, 'GET'))).json()
    expect(body).toEqual({ success: true, data: [{ id: 'o1', role: 'owner' }] })
    expect(fake.calls.innerJoin).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    expect((await GET(jsonRequest(url, 'GET'))).status).toBe(500)
  })
})

describe('POST /api/organizations', () => {
  const post = (body: unknown) => jsonRequest(url, 'POST', body)

  it('requires a session and a name', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ name: 'Acme' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Name is required' })
  })

  it('creates the organization and makes the caller its owner', async () => {
    const fake = setupDb()
    const body = await (await POST(post({ name: 'Acme', description: 'd', image: 'i.png' }))).json()
    expect(body.data).toMatchObject({ name: 'Acme', description: 'd', image: 'i.png', ownerId: 'u1' })
    expect(fake.calls.insert).toHaveLength(2)
    expect((fake.calls.values[1] as any[])[0]).toMatchObject({
      organizationId: body.data.id,
      userId: 'u1',
      role: 'owner',
    })
  })

  it('defaults description and image to null', async () => {
    setupDb()
    const body = await (await POST(post({ name: 'Acme' }))).json()
    expect(body.data.description).toBeNull()
    expect(body.data.image).toBeNull()
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await POST(post({ name: 'Acme' }))).status).toBe(500)
  })
})
