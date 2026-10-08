/**
 * @fileoverview Route tests for /api/user/check-survey and
 * /api/user/dismiss-survey: the survey is auto-shown only until the user
 * completes or dismisses it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { createFakeDb, jsonRequest } from '../../__tests__/helpers/fake-db'
import { GET } from '../check-survey/route'
import { POST } from '../dismiss-survey/route'

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>

function setupDb(options: Parameters<typeof createFakeDb>[0] = {}) {
  const fake = createFakeDb(options)
  Object.assign(db as unknown as Record<string, unknown>, fake)
  return fake
}

const check = () => GET(jsonRequest('http://localhost/api/user/check-survey', 'GET'))
const dismiss = () => POST(jsonRequest('http://localhost/api/user/dismiss-survey', 'POST'))

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/user/check-survey', () => {
  it('rejects anonymous requests', async () => {
    mockGetSession.mockResolvedValue(null)
    expect((await check()).status).toBe(401)
  })

  it('shows the survey to a user who has neither completed nor dismissed it', async () => {
    setupDb({ query: { users: { findFirst: { surveyResponse: null, surveyDismissedAt: null } } } })
    expect(await (await check()).json()).toEqual({
      hasCompletedSurvey: false,
      hasDismissedSurvey: false,
      shouldShowSurvey: true,
    })
  })

  it('does not show the survey again once dismissed', async () => {
    setupDb({ query: { users: { findFirst: { surveyResponse: null, surveyDismissedAt: new Date() } } } })
    expect(await (await check()).json()).toEqual({
      hasCompletedSurvey: false,
      hasDismissedSurvey: true,
      shouldShowSurvey: false,
    })
  })

  it('does not show the survey once completed', async () => {
    setupDb({ query: { users: { findFirst: { surveyResponse: '{"q1":"a"}', surveyDismissedAt: null } } } })
    const body = await (await check()).json()
    expect(body.hasCompletedSurvey).toBe(true)
    expect(body.shouldShowSurvey).toBe(false)
  })
})

describe('POST /api/user/dismiss-survey', () => {
  it('rejects anonymous requests without writing', async () => {
    mockGetSession.mockResolvedValue(null)
    const fake = setupDb()
    expect((await dismiss()).status).toBe(401)
    expect(fake.calls.update).toBeUndefined()
  })

  it('stamps the dismissal on the signed-in user', async () => {
    const fake = setupDb()
    const res = await dismiss()
    expect(await res.json()).toEqual({ success: true })
    const set = (fake.calls.set[0] as any[])[0]
    expect(set.surveyDismissedAt).toBeInstanceOf(Date)
    expect(set.updatedAt).toBeInstanceOf(Date)
  })
})
