/**
 * @fileoverview The Scalar API reference moved from `/api/docs` up to `/api`.
 * Both halves of that move are load-bearing and neither fails loudly: a viewer
 * served from the wrong path is a 404 people meet before they meet the API,
 * and a dropped redirect quietly breaks the `/api/docs` badge in every
 * published README — including the copy of the api-client README on npm,
 * which cannot be edited.
 */
import { describe, it, expect } from 'vitest'

import { GET as apiReference, OPENAPI_SPEC_URL } from '../route'
import { GET as docsRedirect, HEAD as docsRedirectHead } from '../docs/route'

describe('GET /api', () => {
  it('serves the Scalar viewer pointed at the OpenAPI spec', async () => {
    const res = await apiReference()
    const html = await res.text()

    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(html).toContain('id="api-reference"')
    expect(html).toContain(`data-url="${OPENAPI_SPEC_URL}"`)
    expect(html).toContain('@scalar/api-reference')
  })

  it('points at a spec route this app actually serves', async () => {
    // `/api/openapi.json` is a real route module, not a URL someone typed once.
    await expect(import('../openapi.json/route')).resolves.toBeTruthy()
    expect(OPENAPI_SPEC_URL).toBe('/api/openapi.json')
  })
})

describe('GET /api/docs', () => {
  it('permanently redirects to the reference at its new home', () => {
    const res = docsRedirect(new Request('https://autoinvestment.broker/api/docs'))

    expect(res.status).toBe(308)
    expect(new URL(res.headers.get('Location')!).pathname).toBe('/api')
  })

  it('answers HEAD the same way, so a link checker sees the move', () => {
    const res = docsRedirectHead(new Request('https://autoinvestment.broker/api/docs'))

    expect(res.status).toBe(308)
  })
})
