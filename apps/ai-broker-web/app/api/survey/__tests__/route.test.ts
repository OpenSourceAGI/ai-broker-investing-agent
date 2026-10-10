/**
 * @fileoverview Route tests for /api/survey: attaches the response to the
 * signed-in user, or to an account found/created by email.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { POST } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const post = (body: unknown) => jsonRequest('http://localhost/api/survey', 'POST', body)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue(null)
})

describe('POST /api/survey', () => {
  it('stores the response on the signed-in user', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const fake = setupDb()
    const body = { experience: 'expert' }
    const res = await POST(post(body))
    expect(await res.json()).toEqual({ success: true, id: 'u1', status: 'updated' })
    const set = (fake.calls.set[0] as any[])[0]
    expect(set.surveyResponse).toBe(JSON.stringify(body))
    expect(set.updatedAt).toBeInstanceOf(Date)
  })

  it('requires an email when nobody is signed in', async () => {
    setupDb()
    const res = await POST(post({ experience: 'expert' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Email is required' })
  })

  it('updates an existing account matched by email', async () => {
    const fake = setupDb({ query: { users: { findFirst: { id: 'existing' } } } })
    const res = await POST(post({ email: 'a@b.co', answer: 1 }))
    expect(await res.json()).toEqual({ success: true, id: 'existing', status: 'updated' })
    expect(fake.calls.update).toHaveLength(1)
    expect(fake.calls.insert).toBeUndefined()
  })

  it('creates an account for an unknown email, naming it from the address when no name is given', async () => {
    const fake = setupDb()
    const body = await (await POST(post({ email: 'jane.doe@example.com' }))).json()
    expect(body).toMatchObject({ success: true, status: 'created' })
    expect(typeof body.id).toBe('string')
    const values = (fake.calls.values[0] as any[])[0]
    expect(values).toMatchObject({ id: body.id, name: 'jane.doe', email: 'jane.doe@example.com' })
    expect(JSON.parse(values.surveyResponse)).toEqual({ email: 'jane.doe@example.com' })
  })

  it('uses the supplied name when creating', async () => {
    const fake = setupDb()
    await POST(post({ email: 'a@b.co', name: 'Alex' }))
    expect((fake.calls.values[0] as any[])[0].name).toBe('Alex')
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { query: new Proxy({}, { get: () => ({ findFirst: () => { throw new Error('db') } }) }) })
    const res = await POST(post({ email: 'a@b.co' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Failed to submit survey' })
  })
})
