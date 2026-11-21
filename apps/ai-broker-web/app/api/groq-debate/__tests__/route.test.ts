/**
 * @fileoverview Route tests for POST /api/groq-debate.
 *
 * Production returned "Debate analyst error: error code: 1003" because, with no
 * debate-analyst URL configured, the route fetched http://localhost:8001 and
 * Cloudflare Workers refuse loopback/IP fetches. These tests pin that the route
 * never fetches localhost and runs the debate in-process instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const propagate = vi.fn()
vi.mock('@/packages/investing/src/trading-agents/graph/trading-graph', () => ({
  TradingAgentsGraph: class {
    propagate = propagate
  },
}))

import { NextRequest } from 'next/server'
import { POST } from '../route'

const post = (body: unknown) =>
  POST(
    new NextRequest('https://autoinvestment.broker/api/groq-debate', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  )

const ENV_KEYS = ['GROQ_API_KEY', 'NEXT_PUBLIC_DEBATE_ANALYST_URL', 'DEBATE_ANALYST_URL', 'NEXT_PUBLIC_API_BASE_URL']
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
  for (const k of ENV_KEYS) delete process.env[k]
  propagate.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
})

describe('POST /api/groq-debate', () => {
  it('rejects a missing or malformed symbol with 400', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ symbol: 'not a ticker!' })).status).toBe(400)
  })

  it('runs in-process and never fetches localhost when no service URL is set', async () => {
    process.env.GROQ_API_KEY = 'test-key'
    process.env.NEXT_PUBLIC_DEBATE_ANALYST_URL = 'http://localhost:8001'
    propagate.mockResolvedValue({
      state: {
        investmentDebateState: { bullHistory: 'Bull case', bearHistory: 'Bear case', judgeDecision: 'Judge' },
        riskDebateState: { judgeDecision: 'Moderate risk' },
      },
      signal: { action: 'BUY', confidence: 0.75, reasoning: 'Because' },
    })

    const res = await post({ symbol: 'aapl', date: '2026-11-20' })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
    expect(propagate).toHaveBeenCalledWith('AAPL', '2026-11-20')
    expect(json.analysis).toMatchObject({
      bull_arguments: ['Bull case'],
      bear_arguments: ['Bear case'],
      risk_assessment: 'Moderate risk',
      final_decision: 'BUY',
      confidence_level: '0.75',
      reasoning: 'Because',
    })
  })

  it('returns 503 when the in-process path has no Groq key', async () => {
    const res = await post({ symbol: 'AAPL' })
    expect(res.status).toBe(503)
    expect(propagate).not.toHaveBeenCalled()
  })

  it('calls a configured public service and maps a failure to 502', async () => {
    process.env.DEBATE_ANALYST_URL = 'https://debate.example.com'
    ;(fetch as any).mockResolvedValue(new Response('error code: 1003', { status: 403, statusText: 'Forbidden' }))

    const res = await post({ symbol: 'AAPL' })
    expect(fetch).toHaveBeenCalledWith('https://debate.example.com/analyze', expect.anything())
    expect(res.status).toBe(502)
    expect(propagate).not.toHaveBeenCalled()
  })
})
