/**
 * @fileoverview Route tests for the admin user endpoints: the paged directory
 * with usage counters, the field allowlist on PATCH, and deletion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/admin/db', () => ({ getAdminDB: vi.fn() }))
vi.mock('@/lib/auth/admin', () => ({ assertAdmin: vi.fn() }))

import { getAdminDB } from '@/lib/admin/db'
import { assertAdmin } from '@/lib/auth/admin'
import {
  createFakeDb,
  jsonRequest,
  routeContext,
  type FakeDb,
} from '../../../__tests__/helpers/fake-db'
import { GET } from '../route'
import { PATCH, DELETE } from '../[id]/route'

const mockGetDB = getAdminDB as unknown as ReturnType<typeof vi.fn>
const mockAssertAdmin = assertAdmin as unknown as ReturnType<typeof vi.fn>

/**
 * The list route runs the page of rows, then the matched-user count, then one
 * count per table in the site-wide totals strip.
 */
function setupList(rows: unknown[], total = rows.length): FakeDb {
  const db = createFakeDb({
    select: (i) => (i === 0 ? rows : i === 1 ? [{ value: total }] : [{ value: 0 }]),
  })
  mockGetDB.mockReturnValue(db)
  return db
}

function setup(options: Parameters<typeof createFakeDb>[0] = {}): FakeDb {
  const db = createFakeDb(options)
  mockGetDB.mockReturnValue(db)
  return db
}

const listRequest = (search = '') =>
  jsonRequest(`http://localhost/api/admin/users${search}`, 'GET')

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertAdmin.mockResolvedValue(undefined)
})

describe('GET /api/admin/users', () => {
  it('returns the guard response for a non-admin', async () => {
    const forbidden = Response.json({ error: 'Forbidden' }, { status: 403 })
    mockAssertAdmin.mockResolvedValue(forbidden)

    expect(await GET(listRequest())).toBe(forbidden)
    expect(mockGetDB).not.toHaveBeenCalled()
  })

  it('returns the rows with paging metadata', async () => {
    setupList([{ id: 'u1' }, { id: 'u2' }], 42)

    const data = await (await GET(listRequest())).json()

    expect(data.users).toHaveLength(2)
    expect(data).toMatchObject({ matchedUsers: 42, page: 1, limit: 25, pageCount: 2 })
  })

  it('returns the site-wide totals strip alongside the page', async () => {
    setupList([], 0)

    const { totals } = await (await GET(listRequest())).json()

    expect(totals).toMatchObject({ users: 0, sessions: 0, trades: 0, signals: 0, activity: 0 })
  })

  it('honours the page and limit parameters', async () => {
    const db = setupList([], 100)

    const data = await (await GET(listRequest('?page=3&limit=10'))).json()

    expect(data).toMatchObject({ page: 3, limit: 10, pageCount: 10 })
    expect(db.calls.limit[0]).toEqual([10])
    expect(db.calls.offset[0]).toEqual([20])
  })

  it('clamps the page to at least 1 and the limit into 1..100', async () => {
    setupList([], 0)
    expect((await (await GET(listRequest('?page=-5'))).json()).page).toBe(1)

    setupList([], 0)
    expect((await (await GET(listRequest('?limit=0'))).json()).limit).toBe(1)

    setupList([], 0)
    expect((await (await GET(listRequest('?limit=9999'))).json()).limit).toBe(100)
  })

  it('converts the last-session timestamp into an ISO string', async () => {
    setupList([{ id: 'u1', lastActiveSeconds: 1_700_000_000 }], 1)

    const { users } = await (await GET(listRequest())).json()

    expect(users[0].lastActiveAt).toBe(new Date(1_700_000_000_000).toISOString())
    expect(users[0]).not.toHaveProperty('lastActiveSeconds')
  })

  it('reports a never-signed-in account as null rather than the epoch', async () => {
    setupList([{ id: 'u1', lastActiveSeconds: null }], 1)

    const { users } = await (await GET(listRequest())).json()

    expect(users[0].lastActiveAt).toBeNull()
  })

  it('applies a filter for a search, an unverified filter, or neither', async () => {
    const searched = setupList([], 0)
    await GET(listRequest('?q=alice'))
    expect(searched.calls.where[0][0]).toBeDefined()

    const filtered = setupList([], 0)
    await GET(listRequest('?hideUnverified=true'))
    expect(filtered.calls.where[0][0]).toBeDefined()

    const blank = setupList([], 0)
    await GET(listRequest('?q=%20%20'))
    expect(blank.calls.where[0][0]).toBeUndefined()
  })

  it('orders by the requested column, and falls back for an unknown one', async () => {
    const sorted = setupList([], 0)
    await GET(listRequest('?sort=trades&dir=asc'))
    // The tie-breaker on user id is always appended after the sort column.
    expect(sorted.calls.orderBy[0]).toHaveLength(2)

    const unknown = setupList([], 0)
    await GET(listRequest('?sort=; drop table users'))
    expect(unknown.calls.orderBy[0]).toHaveLength(2)
  })
})

describe('PATCH /api/admin/users/[id]', () => {
  const patch = (body: unknown, id = 'u1') =>
    PATCH(
      jsonRequest(`http://localhost/api/admin/users/${id}`, 'PATCH', body),
      routeContext({ id }),
    )

  it('returns the guard response for a non-admin', async () => {
    const forbidden = Response.json({ error: 'Forbidden' }, { status: 403 })
    mockAssertAdmin.mockResolvedValue(forbidden)

    expect(await patch({ name: 'New' })).toBe(forbidden)
  })

  it('rejects a body with no allowlisted fields', async () => {
    setup()

    const res = await patch({ apiKey: 'stolen', stripeCustomerId: 'cus_x' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No valid fields to update')
  })

  it('writes only the allowlisted fields', async () => {
    const db = setup({ update: [{ id: 'u1', name: 'New' }] })

    const res = await patch({
      name: 'New',
      emailVerified: true,
      usageCount: '30',
      // Never writable: these are credentials on the same table.
      apiKey: 'stolen',
      alpacaSecretKey: 'stolen',
    })

    expect(res.status).toBe(200)
    const written = db.calls.set[0][0] as Record<string, unknown>
    expect(written).toMatchObject({ name: 'New', emailVerified: true, usageCount: 30 })
    expect(written).not.toHaveProperty('apiKey')
    expect(written).not.toHaveProperty('alpacaSecretKey')
    expect(written.updatedAt).toBeInstanceOf(Date)
  })

  it('rejects a value of the wrong shape rather than coercing it', async () => {
    setup({ update: [{ id: 'u1' }] })

    const res = await patch({ emailVerified: 'yes' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid value for emailVerified')
  })

  it('rejects an unparseable usage count', async () => {
    setup({ update: [{ id: 'u1' }] })

    expect((await patch({ usageCount: 'lots' })).status).toBe(400)
  })

  it('strips the credential columns out of the echoed row', async () => {
    setup({
      update: [
        {
          id: 'u1',
          name: 'New',
          apiKey: 'secret',
          alpacaKeyId: 'key',
          alpacaSecretKey: 'secret',
          kycSessionId: 'session',
        },
      ],
    })

    const { user } = await (await patch({ name: 'New' })).json()

    expect(user).toEqual({ id: 'u1', name: 'New' })
  })

  it('rejects a body that is not an object', async () => {
    setup()

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/users/u1', 'PATCH', 'not-an-object'),
      routeContext({ id: 'u1' }),
    )

    expect(res.status).toBe(400)
  })

  it('404s when the update matched no row', async () => {
    setup({ update: [] })

    const res = await patch({ name: 'New' })

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('User not found')
  })
})

describe('DELETE /api/admin/users/[id]', () => {
  const del = (id = 'u1') =>
    DELETE(
      jsonRequest(`http://localhost/api/admin/users/${id}`, 'DELETE'),
      routeContext({ id }),
    )

  it('returns the guard response for a non-admin', async () => {
    const forbidden = Response.json({ error: 'Forbidden' }, { status: 403 })
    mockAssertAdmin.mockResolvedValue(forbidden)

    expect(await del()).toBe(forbidden)
  })

  it('deletes the user', async () => {
    setup({ delete: [{ id: 'u1' }] })

    const res = await del()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('404s when no row was deleted', async () => {
    setup({ delete: [] })

    expect((await del('missing')).status).toBe(404)
  })
})
