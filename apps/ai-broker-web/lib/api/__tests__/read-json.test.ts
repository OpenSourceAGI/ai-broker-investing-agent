import { describe, it, expect } from 'vitest'
import { readJson } from '../read-json'

describe('readJson', () => {
  it('parses a JSON body', async () => {
    const res = new Response(JSON.stringify({ success: true, data: [1] }), { status: 200 })
    await expect(readJson(res)).resolves.toEqual({ success: true, data: [1] })
  })

  it('keeps a JSON error body from a failed response', async () => {
    const res = new Response(JSON.stringify({ success: false, code: 'NO_DATA' }), { status: 404 })
    await expect(readJson(res)).resolves.toEqual({ success: false, code: 'NO_DATA' })
  })

  it('turns an empty 524 into a timeout error instead of throwing', async () => {
    const body = await readJson(new Response('', { status: 524 }))
    expect(body.success).toBe(false)
    expect(body.status).toBe(524)
    expect(body.error).toMatch(/timed out/)
  })

  it('turns an HTML 503 page into an unavailable error', async () => {
    const body = await readJson(new Response('<html>Service Unavailable</html>', { status: 503 }))
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/unavailable/)
  })
})
