/**
 * @fileoverview Route tests for /api/share.
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
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET, POST, PATCH } from '../route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>
const mockSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const url = 'http://localhost/api/share'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  delete process.env.NEXT_PUBLIC_APP_URL
  mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'Una', email: 'una@x.io' } })
})

describe('GET /api/share', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await GET(jsonRequest(url, 'GET'))).status).toBe(401)
  })

  it('returns what has been shared with the caller’s email', async () => {
    setupDb({ select: [{ id: 's1', title: 'AAPL' }] })
    expect(await (await GET(jsonRequest(url, 'GET'))).json()).toEqual({ success: true, data: [{ id: 's1', title: 'AAPL' }] })
  })

  it('answers 500 on failure', async () => {
    Object.assign(db as object, { select: () => { throw new Error('db') } })
    expect((await GET(jsonRequest(url, 'GET'))).status).toBe(500)
  })
})

describe('POST /api/share', () => {
  const post = (body: unknown) => jsonRequest(url, 'POST', body)
  const valid = { email: 'bob@x.io', itemType: 'stock_alert', itemId: 'a1' }

  it('requires a session and the three required fields', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await POST(post(valid))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'Una' } })
    for (const missing of ['email', 'itemType', 'itemId']) {
      const body: Record<string, unknown> = { ...valid }
      delete body[missing]
      const res = await POST(post(body))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Email, itemType, and itemId are required' })
    }
  })

  it('rejects unknown item types', async () => {
    setupDb()
    const res = await POST(post({ ...valid, itemType: 'portfolio' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid item type' })
  })

  it.each(['stock_alert', 'debate_report', 'signal', 'strategy'])('accepts %s', async (itemType) => {
    setupDb({ select: [] })
    expect((await POST(post({ ...valid, itemType }))).status).toBe(200)
  })

  it('shares with an unregistered address: no notification, signup link in the email', async () => {
    const fake = setupDb({ select: [] })
    const body = await (await POST(post({ ...valid, symbol: 'AAPL', title: 'Breakout', message: 'look', metadata: { a: 1 } }))).json()

    expect(body.message).toBe('Item shared. Invitation email will be sent.')
    expect(body.data).toMatchObject({
      sharedById: 'u1',
      sharedWithEmail: 'bob@x.io',
      sharedWithUserId: null,
      symbol: 'AAPL',
      title: 'Breakout',
      message: 'look',
      metadata: '{"a":1}',
    })
    expect(fake.calls.insert).toHaveLength(1)

    const mail = mockSendEmail.mock.calls[0][0]
    expect(mail.subject).toBe('Una shared AAPL stock alert with you')
    expect(mail.html).toContain(`https://autoinvestment.broker/sign-up?redirect=/shared/${body.data.id}`)
    expect(mail.html).toContain('<strong>AAPL</strong>')
    expect(mail.html).toContain('<strong>Breakout</strong>')
    expect(mail.html).toContain('"look"')
  })

  it('shares with a registered user: stores the link and sends an in-app notification', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example'
    const fake = setupDb({ select: [{ id: 'u2' }] })
    const body = await (await POST(post({ ...valid, itemType: 'debate_report' }))).json()

    expect(body.message).toBe('Item shared and notification sent')
    expect(body.data.sharedWithUserId).toBe('u2')
    expect(body.data.symbol).toBeNull()
    expect(body.data.metadata).toBeNull()
    expect(fake.calls.insert).toHaveLength(2)
    expect((fake.calls.values[1] as any[])[0]).toMatchObject({
      userId: 'u2',
      type: 'share',
      title: 'Una shared debate report with you',
      message: 'Check out this debate report',
      actionUrl: `/shared/${body.data.id}`,
      relatedItemType: 'debate_report',
    })
    const mail = mockSendEmail.mock.calls[0][0]
    expect(mail.subject).toBe('Una shared debate report with you')
    expect(mail.html).toContain(`https://staging.example/shared/${body.data.id}`)
  })

  it('prefers the title, then the message, for the notification text', async () => {
    let fake = setupDb({ select: [{ id: 'u2' }] })
    await POST(post({ ...valid, title: 'T', message: 'M' }))
    expect((fake.calls.values[1] as any[])[0].message).toBe('T')
    fake = setupDb({ select: [{ id: 'u2' }] })
    await POST(post({ ...valid, message: 'M' }))
    expect((fake.calls.values[1] as any[])[0].message).toBe('M')
  })

  it('answers 500 when sending the email fails', async () => {
    setupDb({ select: [] })
    mockSendEmail.mockRejectedValueOnce(new Error('smtp'))
    const res = await POST(post(valid))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'smtp' })
  })
})

describe('PATCH /api/share', () => {
  const patch = (body: unknown) => jsonRequest(url, 'PATCH', body)

  it('requires a session and an id', async () => {
    mockGetSession.mockResolvedValue(null)
    setupDb()
    expect((await PATCH(patch({ sharedItemId: 's1' }))).status).toBe(401)
    mockGetSession.mockResolvedValue({ user: { id: 'u1', email: 'una@x.io' } })
    const res = await PATCH(patch({}))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Shared item ID is required' })
  })

  it('404s for unknown items and 403s when shared with someone else', async () => {
    setupDb({ select: [] })
    expect((await PATCH(patch({ sharedItemId: 's1' }))).status).toBe(404)
    setupDb({ select: [{ id: 's1', sharedWithEmail: 'other@x.io' }] })
    expect((await PATCH(patch({ sharedItemId: 's1' }))).status).toBe(403)
  })

  it('stamps viewedAt for the recipient', async () => {
    const fake = setupDb({ select: [{ id: 's1', sharedWithEmail: 'una@x.io' }] })
    const res = await PATCH(patch({ sharedItemId: 's1' }))
    expect(await res.json()).toEqual({ success: true, message: 'Marked as viewed' })
    expect((fake.calls.set[0] as any[])[0].viewedAt).toBeInstanceOf(Date)
  })

  it('answers 500 on failure', async () => {
    mockGetSession.mockRejectedValue(new Error('x'))
    expect((await PATCH(patch({ sharedItemId: 's1' }))).status).toBe(500)
  })
})
