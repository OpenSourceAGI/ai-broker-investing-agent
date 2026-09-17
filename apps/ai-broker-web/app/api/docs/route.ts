/**
 * @fileoverview Redirect for the API reference's former address.
 *
 * The Scalar viewer moved up to `/api` (see `app/api/route.ts`). The README
 * badges here point at `/api/docs`, and so does the copy of the
 * `ai-broker-api-client` README already published to npm, which cannot be
 * edited — so this stays as a permanent redirect rather than a 404.
 */
import { NextResponse } from 'next/server'

/** Where the API reference now lives. */
export const API_REFERENCE_PATH = '/api'

function redirectToApiReference(request: Request): Response {
  // 308 keeps the method and tells caches and crawlers the move is permanent,
  // so the badges settle on the new URL instead of hopping every time.
  return NextResponse.redirect(new URL(API_REFERENCE_PATH, request.url), 308)
}

export const GET = redirectToApiReference
export const HEAD = redirectToApiReference
