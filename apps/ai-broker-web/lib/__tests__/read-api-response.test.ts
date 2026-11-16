import { describe, it, expect } from 'vitest'
import { readApiResponse } from '../read-api-response'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('readApiResponse', () => {
  it('returns the data of a successful JSON response', async () => {
    expect(await readApiResponse(json({ success: true, n: 1 }))).toEqual({ ok: true, data: { success: true, n: 1 } })
  })

  it('returns the error message of a JSON error response', async () => {
    expect(await readApiResponse(json({ success: false, error: 'fee too high' }, 400))).toEqual({
      ok: false,
      error: 'fee too high',
    })
  })

  it('treats success: false as an error even with HTTP 200', async () => {
    expect(await readApiResponse(json({ success: false, error: 'nope' }))).toEqual({ ok: false, error: 'nope' })
  })

  it('turns a non-JSON error page into a readable message instead of a parse error', async () => {
    const res = new Response('Error: The Workers runtime canceled this request', { status: 500 })
    expect(await readApiResponse(res)).toEqual({
      ok: false,
      error: 'The server returned an error (HTTP 500). Try again, or turn on demo mode.',
    })
  })
})
