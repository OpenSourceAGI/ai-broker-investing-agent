/**
 * @fileoverview The API reference, served at the API root.
 *
 * `GET /api` renders the Scalar viewer against the OpenAPI spec at
 * `/api/openapi.json`. It lives here rather than a level down because `/api`
 * is the URL people try first; the old `/api/docs` address redirects here so
 * the badges already published to npm keep working.
 */
import { NextResponse } from 'next/server'

/** Where the spec this viewer renders is served from. */
export const OPENAPI_SPEC_URL = '/api/openapi.json'

const config = {
  spec: {
    url: OPENAPI_SPEC_URL,
  },
  theme: 'solarized',
}

export async function GET() {
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>API Documentation</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${OPENAPI_SPEC_URL}"
      data-configuration='${JSON.stringify(config)}'></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  })
}
