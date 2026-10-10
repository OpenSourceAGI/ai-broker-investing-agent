/**
 * @fileoverview Route tests for /api/invitations: listing sent/received,
 * sending (notification for existing users, always an email) and the
 * accept/reject state machine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET, POST, PATCH } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>
const mockSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = (qs = '') => `http://localhost/api/invitations${qs}`

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  delete process.env.NEXT_PUBLIC_APP_URL
  mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'Una', email: 'una@x.io' } })
})

afterEach(() => vi.useRealTimers())

describe('GET /api/invitations', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(401)
  })

  it('returns sent or received invitations depending on ?type', async () => {
    setupDb({ select: [{ id: 'i1' }] })
    expect(await (await GET(jsonRequest(url('?type=sent'), 'GET'))).json()).toEqual({ success: true, data: [{ id: 'i1' }] })
    expect(await (await GET(jsonRequest(url(), 'GET'))).json()).toEqual({ success: true, data: [{ id: 'i1' }] })
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    expect((await GET(jsonRequest(url(), 'GET'))).status).toBe(500)
  })
})

describe('POST /api/invitations', () => {
  const post = (body: unknown) => jsonRequest(url(), 'POST', body)

  it('requires a session and an email', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post({ email: 'a@b.co' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await POST(post({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Email is required' })
  })

  it('creates a pending 7-day invitation and emails a signup link to a new address', async () => {
    const fake = setupDb({ select: [] })
    const before = Date.now()
    const body = await (await POST(post({ email: 'new@x.io' }))).json()

    expect(body.message).toBe('Invitation sent')
    expect(body.data).toMatchObject({
      inviterId: 'u1',
      email: 'new@x.io',
      status: 'pending',
      organizationId: null,
      teamId: null,
    })
    const days = (new Date(body.data.expiresAt).getTime() - before) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThan(7.01)
    expect(fake.calls.insert).toHaveLength(1)

    const mail = mockSendEmail.mock.calls[0][0]
    expect(mail.to).toBe('new@x.io')
    expect(mail.subject).toBe('Una invited you')
    expect(mail.html).toContain(`https://autoinvestment.broker/sign-up?invite=${body.data.id}`)
    expect(mail.html).not.toContain('their organization')
  })

  it('notifies an existing user and mentions the organization when one is given', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example'
    const fake = setupDb({ select: [{ id: 'u2' }] })
    await POST(post({ email: 'old@x.io', organizationId: 'o1', teamId: 't1' }))

    expect(fake.calls.insert).toHaveLength(2)
    expect((fake.calls.values[0] as any[])[0]).toMatchObject({ organizationId: 'o1', teamId: 't1' })
    expect((fake.calls.values[1] as any[])[0]).toMatchObject({
      userId: 'u2',
      type: 'invite',
      message: 'Una invited you to join an organization',
      fromUserId: 'u1',
    })
    const html = mockSendEmail.mock.calls[0][0].html as string
    expect(html).toContain('their organization')
    expect(html).toContain('https://staging.example/sign-up?invite=')
  })

  it('uses a plain notification message without an organization', async () => {
    const fake = setupDb({ select: [{ id: 'u2' }] })
    await POST(post({ email: 'old@x.io' }))
    expect((fake.calls.values[1] as any[])[0].message).toBe('Una sent you an invitation')
  })

  it('answers 500 when sending fails', async () => {
    setupDb({ select: [] })
    mockSendEmail.mockRejectedValueOnce(new Error('smtp'))
    const res = await POST(post({ email: 'new@x.io' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'smtp' })
  })
})

describe('PATCH /api/invitations', () => {
  const patch = (body: unknown) => jsonRequest(url(), 'PATCH', body)
  const pending = (over: Record<string, unknown> = {}) => ({
    id: 'i1',
    email: 'una@x.io',
    status: 'pending',
    organizationId: null,
    teamId: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    ...over,
  })

  it('requires a session and a valid status', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1', email: 'una@x.io' } })
    for (const body of [{}, { invitationId: 'i1' }, { invitationId: 'i1', status: 'maybe' }, { status: 'accepted' }]) {
      const res = await PATCH(patch(body))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid request' })
    }
  })

  it('404s for an unknown invitation and 403s for someone else’s', async () => {
    setupDb({ select: [] })
    expect((await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))).status).toBe(404)
    setupDb({ select: [pending({ email: 'other@x.io' })] })
    expect((await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))).status).toBe(403)
  })

  it('refuses already-processed and expired invitations', async () => {
    setupDb({ select: [pending({ status: 'accepted' })] })
    let res = await PATCH(patch({ invitationId: 'i1', status: 'rejected' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invitation already processed' })

    setupDb({ select: [pending({ expiresAt: new Date(Date.now() - 1000) })] })
    res = await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invitation expired' })
  })

  it('rejecting only updates the status', async () => {
    const fake = setupDb({ select: [pending({ organizationId: 'o1', teamId: 't1' })] })
    const res = await PATCH(patch({ invitationId: 'i1', status: 'rejected' }))
    expect(await res.json()).toEqual({ success: true, message: 'Invitation rejected' })
    expect((fake.calls.set[0] as any[])[0]).toEqual({ status: 'rejected' })
    expect(fake.calls.insert).toBeUndefined()
  })

  it('accepting a bare invitation only updates the status', async () => {
    const fake = setupDb({ select: [pending()] })
    const res = await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))
    expect(await res.json()).toEqual({ success: true, message: 'Invitation accepted' })
    expect(fake.calls.insert).toBeUndefined()
  })

  it('accepting adds the user to the organization and team as a member', async () => {
    const fake = setupDb({ select: [pending({ organizationId: 'o1', teamId: 't1' })] })
    await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))
    expect(fake.calls.insert).toHaveLength(2)
    expect((fake.calls.values[0] as any[])[0]).toMatchObject({ organizationId: 'o1', userId: 'u1', role: 'member' })
    expect((fake.calls.values[1] as any[])[0]).toMatchObject({ teamId: 't1', userId: 'u1', role: 'member' })
  })

  it('accepting an organization-only or team-only invitation adds just that membership', async () => {
    let fake = setupDb({ select: [pending({ organizationId: 'o1' })] })
    await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))
    expect(fake.calls.insert).toHaveLength(1)
    fake = setupDb({ select: [pending({ teamId: 't1' })] })
    await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))
    expect(fake.calls.insert).toHaveLength(1)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await PATCH(patch({ invitationId: 'i1', status: 'accepted' }))).status).toBe(500)
  })
})
