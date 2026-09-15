/**
 * @fileoverview The ADMIN_EMAILS gate. The failure mode worth guarding is an
 * unset or malformed list quietly granting access, so most of these assert
 * that nobody is an admin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/env/runtime', () => ({ serverEnv: vi.fn() }))
vi.mock('../session', () => ({ getSession: vi.fn() }))

import { serverEnv } from '@/lib/env/runtime'
import { getSession } from '../session'
import { assertAdmin, getAdminAccess, getAdminEmails, isAdminEmail } from '../admin'

const mockServerEnv = serverEnv as unknown as ReturnType<typeof vi.fn>
const mockGetSession = getSession as unknown as ReturnType<typeof vi.fn>

/** Stands in for the Worker env: only the listed names are set. */
function env(values: Record<string, string | undefined>) {
  mockServerEnv.mockImplementation((name: string) => values[name])
}

const signedInAs = (email: string) =>
  mockGetSession.mockResolvedValue({ user: { id: 'u1', email }, session: { id: 's1' } })

beforeEach(() => {
  vi.clearAllMocks()
  env({})
  mockGetSession.mockResolvedValue(null)
})

describe('getAdminEmails', () => {
  it('is empty when neither variable is set', () => {
    expect(getAdminEmails()).toEqual([])
  })

  it('splits, trims and lowercases the list', () => {
    env({ ADMIN_EMAILS: ' Alice@Example.com , bob@example.com ' })

    expect(getAdminEmails()).toEqual(['alice@example.com', 'bob@example.com'])
  })

  it('merges the singular and plural variables', () => {
    env({ ADMIN_EMAIL: 'solo@example.com', ADMIN_EMAILS: 'a@example.com,b@example.com' })

    expect(getAdminEmails()).toEqual(['solo@example.com', 'a@example.com', 'b@example.com'])
  })

  it('drops the empty segments a trailing or doubled comma leaves behind', () => {
    env({ ADMIN_EMAILS: 'a@example.com,,  ,' })

    expect(getAdminEmails()).toEqual(['a@example.com'])
  })
})

describe('isAdminEmail', () => {
  it('grants nobody when the list is unset', () => {
    expect(isAdminEmail('anyone@example.com')).toBe(false)
  })

  it('grants nobody when the list is only separators', () => {
    env({ ADMIN_EMAILS: ' , , ' })

    expect(isAdminEmail('anyone@example.com')).toBe(false)
  })

  it('matches regardless of case', () => {
    env({ ADMIN_EMAILS: 'alice@example.com' })

    expect(isAdminEmail('ALICE@Example.com')).toBe(true)
    expect(isAdminEmail('mallory@example.com')).toBe(false)
  })

  it('rejects a missing address', () => {
    env({ ADMIN_EMAILS: 'alice@example.com' })

    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
    expect(isAdminEmail('')).toBe(false)
  })
})

describe('getAdminAccess', () => {
  it('reports a signed-out visitor as neither admin nor identified', async () => {
    env({ ADMIN_EMAILS: 'alice@example.com' })

    expect(await getAdminAccess()).toEqual({ isAdmin: false, email: null })
  })

  it('reports a signed-in admin', async () => {
    env({ ADMIN_EMAILS: 'alice@example.com' })
    signedInAs('Alice@example.com')

    expect(await getAdminAccess()).toEqual({ isAdmin: true, email: 'alice@example.com' })
  })

  it('reports a signed-in non-admin with their address, so the page can say who', async () => {
    env({ ADMIN_EMAILS: 'alice@example.com' })
    signedInAs('mallory@example.com')

    expect(await getAdminAccess()).toEqual({ isAdmin: false, email: 'mallory@example.com' })
  })
})

describe('assertAdmin', () => {
  it('401s a signed-out caller', async () => {
    env({ ADMIN_EMAILS: 'alice@example.com' })

    const res = await assertAdmin()

    expect(res?.status).toBe(401)
  })

  it('403s a signed-in non-admin', async () => {
    env({ ADMIN_EMAILS: 'alice@example.com' })
    signedInAs('mallory@example.com')

    const res = await assertAdmin()

    expect(res?.status).toBe(403)
    expect(await res?.json()).toEqual({ error: 'Forbidden' })
  })

  it('403s every caller when the allowlist is unset', async () => {
    signedInAs('anyone@example.com')

    expect((await assertAdmin())?.status).toBe(403)
  })

  it('returns null — continue — for an admin', async () => {
    env({ ADMIN_EMAILS: 'alice@example.com' })
    signedInAs('alice@example.com')

    expect(await assertAdmin()).toBeNull()
  })
})
