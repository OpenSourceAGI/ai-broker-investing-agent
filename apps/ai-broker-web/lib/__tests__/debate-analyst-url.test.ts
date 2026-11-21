import { describe, it, expect } from 'vitest'
import { isUnreachableFromWorker, resolveDebateAnalystUrl } from '../debate-analyst-url'

describe('resolveDebateAnalystUrl', () => {
  it('returns null when nothing is configured (no localhost fallback)', () => {
    expect(resolveDebateAnalystUrl({})).toBeNull()
  })

  it('rejects localhost and bare-IP URLs that Workers refuse with error 1003', () => {
    expect(resolveDebateAnalystUrl({ NEXT_PUBLIC_DEBATE_ANALYST_URL: 'http://localhost:8001' })).toBeNull()
    expect(resolveDebateAnalystUrl({ DEBATE_ANALYST_URL: 'http://127.0.0.1:8001' })).toBeNull()
    expect(resolveDebateAnalystUrl({ DEBATE_ANALYST_URL: 'http://203.0.113.7' })).toBeNull()
    expect(resolveDebateAnalystUrl({ NEXT_PUBLIC_API_BASE_URL: 'http://[::1]:3000' })).toBeNull()
  })

  it('rejects malformed and non-http URLs', () => {
    expect(resolveDebateAnalystUrl({ DEBATE_ANALYST_URL: 'not a url' })).toBeNull()
    expect(resolveDebateAnalystUrl({ DEBATE_ANALYST_URL: 'ftp://debate.example.com' })).toBeNull()
  })

  it('uses a public direct URL', () => {
    expect(resolveDebateAnalystUrl({ DEBATE_ANALYST_URL: 'https://debate.example.com/' })).toBe(
      'https://debate.example.com/analyze'
    )
  })

  it('prefers the API gateway when set', () => {
    expect(
      resolveDebateAnalystUrl({
        NEXT_PUBLIC_API_BASE_URL: 'https://api.example.com',
        DEBATE_ANALYST_URL: 'https://debate.example.com',
      })
    ).toBe('https://api.example.com/debate-analyst/analyze')
  })
})

describe('isUnreachableFromWorker', () => {
  it('flags loopback and IPs but not public hostnames', () => {
    expect(isUnreachableFromWorker('localhost')).toBe(true)
    expect(isUnreachableFromWorker('app.localhost')).toBe(true)
    expect(isUnreachableFromWorker('10.0.0.1')).toBe(true)
    expect(isUnreachableFromWorker('api.groq.com')).toBe(false)
  })
})
