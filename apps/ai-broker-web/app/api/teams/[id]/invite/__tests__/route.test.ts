/**
 * @fileoverview Route tests for /api/teams/[id]/invite: existing accounts are
 * added directly (plus an in-app notice and an email); everyone else gets a
 * pending invitation and a signup email.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))
vi.mock('@/lib/email/send-email', () => ({
  sendEmail: vi.fn(async () => undefined),
  renderEmailLayout: vi.fn((title: string, body: string) => `<layout title="${title}">${body}</layout>`),
  renderEmailButton: vi.fn((label: string, href: string) => `<a href="${href}">${label}</a>`),
}))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { sendEmail } from '@/lib/email/send-email'
import { createFakeDb, jsonRequest } from '../../../../__tests__/helpers/fake-db'
import { POST } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>
const mockSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const ctx = { params: { id: 't1' } }
const TEAM = { id: 't1', organizationId: 'o1', name: 'Alpha' }
const ORG = { id: 'o1', name: 'Acme' }
const rows = (...results: unknown[][]) => (i: number) => results[i] ?? []
const post = (body: unknown) => jsonRequest('http://localhost/api/teams/t1/invite', 'POST', body)

/** select() order: team, org membership, team membership, org, user-by-email, [already in team, already in org]. */
const asAdmin = (...rest: unknown[][]) => rows([TEAM], [{ role: 'admin' }], [], [ORG], ...rest)

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  delete process.env.NEXT_PUBLIC_APP_URL
  mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'Una' } })
})

describe('POST /api/teams/[id]/invite — guards', () => {
  it('requires a session and an email', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ email: 'a@b.co' }), ctx)).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    expect((await POST(post({}), ctx)).status).toBe(400)
    const bad = await POST(post({ email: 42 }), ctx)
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ error: 'Email is required' })
  })

  it('404s for an unknown team and 403s for ordinary members', async () => {
    setupDb({ select: [] })
    expect((await POST(post({ email: 'a@b.co' }), ctx)).status).toBe(404)
    setupDb({ select: rows([TEAM], [{ role: 'member' }], [{ role: 'member' }]) })
    expect((await POST(post({ email: 'a@b.co' }), ctx)).status).toBe(403)
  })
})

describe('POST /api/teams/[id]/invite — existing account', () => {
  const existing = [{ id: 'u2', email: 'a@b.co' }]

  it('refuses to invite yourself', async () => {
    setupDb({ select: asAdmin([{ id: 'u1', email: 'a@b.co' }]) })
    const res = await POST(post({ email: 'a@b.co' }), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Cannot invite yourself' })
  })

  it('refuses someone already on the team', async () => {
    setupDb({ select: asAdmin(existing, [{ id: 'tm' }]) })
    const res = await POST(post({ email: 'a@b.co' }), ctx)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'User is already a team member' })
  })

  it('adds an org member to the team, notifies them and sends an email', async () => {
    const fake = setupDb({ select: asAdmin(existing, [], [{ id: 'om' }]) })
    const res = await POST(post({ email: 'a@b.co' }), ctx)
    expect(await res.json()).toEqual({ success: true, invited: false, message: 'Member added' })

    // team member + notification (no org insert: already in the organization)
    expect(fake.calls.insert).toHaveLength(2)
    expect((fake.calls.values[0] as any[])[0]).toMatchObject({ teamId: 't1', userId: 'u2', role: 'member' })
    expect((fake.calls.values[1] as any[])[0]).toMatchObject({
      userId: 'u2',
      type: 'invite',
      message: 'Una added you to Alpha',
      relatedItemType: 'team',
    })
    const mail = mockSendEmail.mock.calls[0][0]
    expect(mail.to).toBe('a@b.co')
    expect(mail.subject).toBe("You've been added to Alpha")
    expect(mail.html).toContain('in Acme')
    expect(mail.html).toContain('https://autoinvestment.broker/dashboard')
  })

  it('also adds them to the organization when they were not in it', async () => {
    const fake = setupDb({ select: asAdmin(existing, [], []) })
    await POST(post({ email: 'a@b.co' }), ctx)
    expect(fake.calls.insert).toHaveLength(3)
    expect((fake.calls.values[0] as any[])[0]).toMatchObject({ organizationId: 'o1', userId: 'u2', role: 'member' })
  })

  it('uses NEXT_PUBLIC_APP_URL for links and omits the org name when it is missing', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example'
    setupDb({ select: rows([TEAM], [{ role: 'admin' }], [], [], existing, [], [{ id: 'om' }]) })
    await POST(post({ email: 'a@b.co' }), ctx)
    const html = mockSendEmail.mock.calls[0][0].html as string
    expect(html).toContain('https://staging.example/dashboard')
    expect(html).not.toContain(' in Acme')
  })

  it('lets a team lead invite too', async () => {
    setupDb({ select: rows([TEAM], [], [{ role: 'lead' }], [ORG], existing, [], [{ id: 'om' }]) })
    const res = await POST(post({ email: 'a@b.co' }), ctx)
    expect((await res.json()).invited).toBe(false)
  })
})

describe('POST /api/teams/[id]/invite — new email address', () => {
  it('stores a 7-day pending invitation and emails a signup link', async () => {
    const fake = setupDb({ select: asAdmin([]) })
    const before = Date.now()
    const res = await POST(post({ email: 'new@person.io' }), ctx)
    expect(await res.json()).toEqual({ success: true, invited: true, message: 'Invitation email sent' })

    const invitation = (fake.calls.values[0] as any[])[0]
    expect(invitation).toMatchObject({
      inviterId: 'u1',
      email: 'new@person.io',
      status: 'pending',
      organizationId: 'o1',
      teamId: 't1',
    })
    const days = (invitation.expiresAt.getTime() - before) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThan(7.01)

    const mail = mockSendEmail.mock.calls[0][0]
    expect(mail.subject).toBe('Una invited you to join Alpha')
    expect(mail.html).toContain(`https://autoinvestment.broker/sign-up?invite=${invitation.id}`)
    expect(mail.html).toContain('expires in 7 days')
  })

  it('answers 500 when the email cannot be sent', async () => {
    setupDb({ select: asAdmin([]) })
    mockSendEmail.mockRejectedValueOnce(new Error('smtp down'))
    const res = await POST(post({ email: 'new@person.io' }), ctx)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'smtp down' })
  })
})
