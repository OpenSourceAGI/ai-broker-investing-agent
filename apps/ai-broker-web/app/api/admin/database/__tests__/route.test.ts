/**
 * @fileoverview Route tests for the admin database controls: the table
 * registry, the row browser, the editable-column allowlist on PATCH, row
 * deletion, and the named maintenance actions.
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
import { GET as REGISTRY } from '../route'
import { GET as ROWS } from '../[table]/route'
import { PATCH, DELETE } from '../[table]/[id]/route'
import { POST as MAINTENANCE } from '../maintenance/route'
import { ADMIN_TABLE_KEYS, MAINTENANCE_ACTION_KEYS } from '@/lib/admin/db-tables'

const mockGetDB = getAdminDB as unknown as ReturnType<typeof vi.fn>
const mockAssertAdmin = assertAdmin as unknown as ReturnType<typeof vi.fn>

function setup(options: Parameters<typeof createFakeDb>[0] = {}): FakeDb {
  const db = createFakeDb(options)
  mockGetDB.mockReturnValue(db)
  return db
}

const forbidden = () => {
  const response = Response.json({ error: 'Forbidden' }, { status: 403 })
  mockAssertAdmin.mockResolvedValue(response)
  return response
}

/** The row browser runs the page of rows, then the matched-row count. */
const pagedSelect = () => ({ select: (i: number) => (i === 0 ? [] : [{ value: 0 }]) })

beforeEach(() => {
  vi.clearAllMocks()
  mockAssertAdmin.mockResolvedValue(undefined)
})

describe('GET /api/admin/database', () => {
  it('returns the guard response for a non-admin', async () => {
    const response = forbidden()

    expect(await REGISTRY()).toBe(response)
    expect(mockGetDB).not.toHaveBeenCalled()
  })

  it('describes every registered table with its row count', async () => {
    setup({ select: [{ value: 7 }] })

    const data = await (await REGISTRY()).json()

    expect(data.tables).toHaveLength(ADMIN_TABLE_KEYS.length)
    expect(data.tables[0]).toMatchObject({ key: 'users', rows: 7 })
    expect(data.maintenance.map((a: { key: string }) => a.key)).toEqual(MAINTENANCE_ACTION_KEYS)
  })

  it('never exposes a credential column to the browser', async () => {
    setup({ select: [{ value: 0 }] })

    const { tables } = await (await REGISTRY()).json()
    const columns = tables.flatMap((t: { columns: string[] }) => t.columns)

    for (const secret of [
      'password',
      'accessToken',
      'refreshToken',
      'idToken',
      'token',
      'apiKey',
      'alpacaKeyId',
      'alpacaSecretKey',
      'kycSessionId',
      'groqApiKey',
      'openaiApiKey',
      'anthropicApiKey',
      'robinhoodPassword',
      'webullPassword',
      'ibkrPassword',
    ]) {
      expect(columns).not.toContain(secret)
    }
  })
})

describe('GET /api/admin/database/[table]', () => {
  const get = (table: string, search = '') =>
    ROWS(
      jsonRequest(`http://localhost/api/admin/database/${table}${search}`, 'GET'),
      routeContext({ table }),
    )

  it('returns the guard response for a non-admin', async () => {
    const response = forbidden()

    expect(await get('users')).toBe(response)
  })

  it('404s for a table outside the registry', async () => {
    setup()

    const res = await get('sqlite_master')

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Unknown table')
    expect(mockGetDB).not.toHaveBeenCalled()
  })

  it('returns a page of rows with the table descriptor', async () => {
    setup({ select: (i) => (i === 0 ? [{ id: 'u1' }] : [{ value: 30 }]) })

    const data = await (await get('users')).json()

    expect(data.rows).toEqual([{ id: 'u1' }])
    expect(data).toMatchObject({ page: 1, limit: 25, matchedRows: 30, pageCount: 2 })
    expect(data.table).toMatchObject({ key: 'users', primaryKey: 'id' })
  })

  it('clamps paging parameters', async () => {
    const db = setup(pagedSelect())

    const data = await (await get('users', '?page=-2&limit=0')).json()

    expect(data).toMatchObject({ page: 1, limit: 1 })
    expect(db.calls.offset[0]).toEqual([0])

    setup(pagedSelect())
    expect((await (await get('users', '?limit=9999')).json()).limit).toBe(100)
  })

  it('applies a search filter only when q is non-blank', async () => {
    const withSearch = setup(pagedSelect())
    await get('users', '?q=alice')
    expect(withSearch.calls.where[0][0]).toBeDefined()

    const blank = setup(pagedSelect())
    await get('users', '?q=%20%20')
    expect(blank.calls.where[0][0]).toBeUndefined()
  })
})

describe('PATCH /api/admin/database/[table]/[id]', () => {
  const patch = (table: string, body: unknown, id = 'u1') =>
    PATCH(
      jsonRequest(`http://localhost/api/admin/database/${table}/${id}`, 'PATCH', body),
      routeContext({ table, id }),
    )

  it('returns the guard response for a non-admin', async () => {
    const response = forbidden()

    expect(await patch('users', { name: 'New' })).toBe(response)
  })

  it('404s for a table outside the registry', async () => {
    setup()

    expect((await patch('sqlite_master', { name: 'x' })).status).toBe(404)
  })

  it('writes only the columns the registry marks editable', async () => {
    const db = setup({ update: [{ id: 'u1', name: 'New' }] })

    const res = await patch('users', {
      name: 'New',
      usageCount: '12',
      // Neither is editable on `users`; both must be dropped.
      id: 'someone-else',
      stripeCustomerId: 'cus_attacker',
    })

    expect(res.status).toBe(200)
    expect(db.calls.set[0][0]).toEqual({ name: 'New', usageCount: 12 })
  })

  it('coerces a boolean column from its string form', async () => {
    const db = setup({ update: [{ id: 'u1' }] })

    await patch('users', { alpacaPaper: 'false' })

    expect(db.calls.set[0][0]).toEqual({ alpacaPaper: false })
  })

  it('rejects a value that cannot be represented', async () => {
    setup({ update: [{ id: 'u1' }] })

    const res = await patch('users', { usageCount: 'lots' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid value for Usage count')
  })

  it('rejects a body with no editable fields', async () => {
    setup({ update: [{ id: 'u1' }] })

    const res = await patch('users', { stripeCustomerId: 'cus_x' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No editable fields in request')
  })

  it('refuses to write a read-only table', async () => {
    setup({ update: [{ id: 't1' }] })

    const res = await patch('trades', { price: 1 }, 't1')

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Trades rows are read-only')
  })

  it('404s when the update matched no row', async () => {
    setup({ update: [] })

    expect((await patch('users', { name: 'New' })).status).toBe(404)
  })
})

describe('DELETE /api/admin/database/[table]/[id]', () => {
  const del = (table: string, id = 'u1') =>
    DELETE(
      jsonRequest(`http://localhost/api/admin/database/${table}/${id}`, 'DELETE'),
      routeContext({ table, id }),
    )

  it('returns the guard response for a non-admin', async () => {
    const response = forbidden()

    expect(await del('users')).toBe(response)
  })

  it('404s for a table outside the registry', async () => {
    setup()

    expect((await del('sqlite_master')).status).toBe(404)
  })

  it('deletes the row and echoes it back', async () => {
    setup({ delete: [{ id: 'u1' }] })

    const res = await del('users')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, row: { id: 'u1' } })
  })

  it('404s when no row was deleted', async () => {
    setup({ delete: [] })

    expect((await del('users', 'missing')).status).toBe(404)
  })
})

describe('POST /api/admin/database/maintenance', () => {
  const run = (body: unknown) =>
    MAINTENANCE(jsonRequest('http://localhost/api/admin/database/maintenance', 'POST', body))

  it('returns the guard response for a non-admin', async () => {
    const response = forbidden()

    expect(await run({ action: 'purgeExpiredSessions' })).toBe(response)
  })

  it('rejects an action outside the registry', async () => {
    setup()

    const res = await run({ action: 'dropEverything' })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Unknown maintenance action')
    expect(mockGetDB).not.toHaveBeenCalled()
  })

  it('rejects a non-string action', async () => {
    setup()

    expect((await run({ action: { toString: 'purgeExpiredSessions' } })).status).toBe(400)
  })

  it('runs the named action and reports the row count', async () => {
    setup({ delete: { rowsAffected: 4 } })

    const res = await run({ action: 'purgeExpiredSessions' })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ action: 'purgeExpiredSessions', affected: 4 })
  })

  it('reads the D1 changes counter when rowsAffected is absent', async () => {
    setup({ delete: { meta: { changes: 9 } } })

    expect((await (await run({ action: 'purgeExpiredVerifications' })).json()).affected).toBe(9)
  })

  it('reports a failing action as a 500 rather than throwing', async () => {
    const db = createFakeDb()
    db.delete = () => {
      throw new Error('D1 unavailable')
    }
    mockGetDB.mockReturnValue(db)

    const res = await run({ action: 'purgeExpiredSessions' })

    expect(res.status).toBe(500)
    expect((await res.json()).details).toBe('D1 unavailable')
  })
})
