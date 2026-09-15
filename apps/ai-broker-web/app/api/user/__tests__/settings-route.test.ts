/**
 * @fileoverview Route tests for /api/user/settings.
 *
 * The 401 in the browser console is the correct answer for a signed-out
 * visitor, so what matters here is that the route is consistent about it and
 * never leaks a stored provider key back to the client.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET, POST } from '../settings/route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

/** Point the mocked `db` module at a fresh fake for this test. */
function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const getRequest = () => jsonRequest('http://localhost/api/user/settings', 'GET')
const postRequest = (body: unknown) =>
  jsonRequest('http://localhost/api/user/settings', 'POST', body)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
})

describe('GET /api/user/settings — authentication', () => {
  it('answers 401 when there is no session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()

    const res = await GET(getRequest())

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('answers 401 when the session carries no user', async () => {
    mockGetSession.mockResolvedValue({ user: null })
    setupDb()

    expect((await GET(getRequest())).status).toBe(401)
  })

  it('reads the session from the request headers', async () => {
    setupDb()
    const request = getRequest()

    await GET(request)

    expect(mockGetSession).toHaveBeenCalledWith({ headers: request.headers })
  })
})

describe('GET /api/user/settings — payload', () => {
  it('masks every stored provider secret', async () => {
    setupDb({
      query: {
        userSettings: {
          findFirst: {
            userId: 'user-1',
            groqApiKey: 'gsk_real_secret',
            openaiApiKey: 'sk-real-secret',
            anthropicApiKey: 'sk-ant-real',
            alpacaApiSecret: 'alpaca-real',
            robinhoodPassword: 'hunter2',
            theme: 'dark',
          },
        },
        users: { findFirst: { apiKey: 'broker-key' } },
      },
    })

    const body = await (await GET(getRequest())).json()

    for (const field of [
      'groqApiKey',
      'openaiApiKey',
      'anthropicApiKey',
      'alpacaApiSecret',
      'robinhoodPassword',
    ]) {
      expect(body[field]).toBe('••••••••')
    }
    expect(JSON.stringify(body)).not.toMatch(/real|hunter2/)
  })

  it('reports an unset secret as null rather than a mask', async () => {
    setupDb({
      query: {
        userSettings: { findFirst: { userId: 'user-1', groqApiKey: null } },
        users: { findFirst: { apiKey: 'broker-key' } },
      },
    })

    const body = await (await GET(getRequest())).json()

    expect(body.groqApiKey).toBeNull()
  })

  it('passes non-secret settings through untouched', async () => {
    setupDb({
      query: {
        userSettings: { findFirst: { userId: 'user-1', theme: 'dark', uiConfig: '{"a":1}' } },
        users: { findFirst: { apiKey: 'broker-key' } },
      },
    })

    const body = await (await GET(getRequest())).json()

    expect(body).toMatchObject({ theme: 'dark', uiConfig: '{"a":1}', apiKey: 'broker-key' })
  })

  it('returns just the API key when the user has no settings row yet', async () => {
    setupDb({
      query: {
        userSettings: { findFirst: undefined },
        users: { findFirst: { apiKey: 'broker-key' } },
      },
    })

    const res = await GET(getRequest())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ apiKey: 'broker-key' })
  })

  it('reports a null API key when the user profile has none', async () => {
    setupDb({
      query: { userSettings: { findFirst: undefined }, users: { findFirst: undefined } },
    })

    await expect((await GET(getRequest())).json()).resolves.toEqual({ apiKey: null })
  })

  it('answers 500 when the lookup throws', async () => {
    Object.assign(db as unknown as Record<string, unknown>, {
      query: {
        userSettings: {
          findFirst: () => Promise.reject(new Error('D1 unavailable')),
        },
      },
    })

    const res = await GET(getRequest())

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to fetch settings' })
  })
})

describe('POST /api/user/settings', () => {
  it('answers 401 when there is no session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()

    const res = await POST(postRequest({ theme: 'dark' }))

    expect(res.status).toBe(401)
  })

  it('updates the existing row when one is present', async () => {
    const fake = setupDb({
      query: { userSettings: { findFirst: { userId: 'user-1' } } },
    })

    const res = await POST(postRequest({ theme: 'dark' }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ success: true })
    expect(fake.calls.update).toBeDefined()
    expect(fake.calls.insert).toBeUndefined()
  })

  it('inserts a new row when the user has no settings yet', async () => {
    const fake = setupDb({ query: { userSettings: { findFirst: undefined } } })

    const res = await POST(postRequest({ theme: 'dark' }))

    expect(res.status).toBe(200)
    expect(fake.calls.insert).toBeDefined()
    expect(fake.calls.update).toBeUndefined()
  })

  it('stamps updatedAt on an update', async () => {
    const fake = setupDb({ query: { userSettings: { findFirst: { userId: 'user-1' } } } })

    await POST(postRequest({ theme: 'dark' }))

    expect(fake.calls.set[0][0]).toMatchObject({ theme: 'dark', updatedAt: expect.any(Date) })
  })

  it('answers 500 on a malformed JSON body', async () => {
    setupDb()
    const request = new Request('http://localhost/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    }) as any

    const res = await POST(request)

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Failed to save settings' })
  })
})
