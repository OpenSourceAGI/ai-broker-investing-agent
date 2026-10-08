/**
 * @fileoverview Client survey-prompt helpers: the survey is auto-shown at most
 * once, and dismissal sticks in localStorage and on the server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

function memoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
}

function mockFetch(checkBody: unknown, ok = true) {
  const fetchMock = vi.fn(async (url: string) =>
    url.endsWith('/check-survey')
      ? ({ ok, json: async () => checkBody } as Response)
      : ({ ok: true, json: async () => ({ success: true }) } as Response),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let prompt: typeof import('../prompt')

beforeEach(async () => {
  vi.resetModules()
  vi.useRealTimers()
  vi.stubGlobal('window', { localStorage: memoryStorage() })
  prompt = await import('../prompt')
})

const calledUrls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map((c) => c[0])

describe('consumeSurveyPrompt', () => {
  it('prompts a new user once and records the dismissal', async () => {
    const fetchMock = mockFetch({ shouldShowSurvey: true, hasDismissedSurvey: false })
    expect(await prompt.consumeSurveyPrompt()).toBe(true)
    expect(calledUrls(fetchMock)).toContain('/api/user/dismiss-survey')
    expect(window.localStorage.getItem(prompt.SURVEY_DISMISSED_KEY)).toBe('1')
  })

  it('never prompts again in this browser after a dismissal', async () => {
    window.localStorage.setItem(prompt.SURVEY_DISMISSED_KEY, '1')
    const fetchMock = mockFetch({ shouldShowSurvey: true })
    expect(await prompt.consumeSurveyPrompt()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('respects a dismissal recorded on another device', async () => {
    mockFetch({ shouldShowSurvey: false, hasDismissedSurvey: true })
    expect(await prompt.consumeSurveyPrompt()).toBe(false)
    expect(window.localStorage.getItem(prompt.SURVEY_DISMISSED_KEY)).toBe('1')
  })

  it('does not prompt when the status check fails', async () => {
    mockFetch({ error: 'boom' }, false)
    expect(await prompt.consumeSurveyPrompt()).toBe(false)
  })

  it('gives concurrent callers the same answer', async () => {
    const fetchMock = mockFetch({ shouldShowSurvey: true, hasDismissedSurvey: false })
    const [a, b] = await Promise.all([prompt.consumeSurveyPrompt(), prompt.consumeSurveyPrompt()])
    expect([a, b]).toEqual([true, true])
    expect(calledUrls(fetchMock).filter((u) => u.endsWith('/check-survey'))).toHaveLength(1)
  })
})

describe('dismissSurvey', () => {
  it('stores the dismissal locally and on the account', async () => {
    const fetchMock = mockFetch({})
    await prompt.dismissSurvey()
    expect(window.localStorage.getItem(prompt.SURVEY_DISMISSED_KEY)).toBe('1')
    expect(fetchMock).toHaveBeenCalledWith('/api/user/dismiss-survey', { method: 'POST', keepalive: true })
  })
})
