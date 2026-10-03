/**
 * @fileoverview Route tests for /api/users/search (invite autocomplete).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../../__tests__/helpers/fake-db'
import { GET } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const get = (qs = '') => jsonRequest(`http://localhost/api/users/search${qs}`, 'GET')

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/users/search', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(get('?q=ab'))).status).toBe(401)
  })

  it.each(['', '?q=', '?q=a', '?q=%20a%20'])('returns nothing for a query under two characters (%j)', async (qs) => {
    const fake = setupDb({ select: [{ id: 'x' }] })
    expect(await (await GET(get(qs))).json()).toEqual({ success: true, data: [] })
    expect(fake.calls.select).toBeUndefined()
  })

  it('searches and caps results at 10', async () => {
    const fake = setupDb({ select: [{ id: 'u2', name: 'Bob' }] })
    expect(await (await GET(get('?q=bo'))).json()).toEqual({ success: true, data: [{ id: 'u2', name: 'Bob' }] })
    expect(fake.calls.limit[0]).toEqual([10])
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    const res = await GET(get('?q=bo'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'db' })
  })
})
