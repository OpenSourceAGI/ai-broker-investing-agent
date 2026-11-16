/**
 * Read a `{ success, error, ... }` JSON API response. A response that is not
 * JSON (for example a runtime error page) becomes a readable error instead
 * of surfacing a JSON parse error to the user.
 */
export async function readApiResponse<T = unknown>(
  res: Response,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const text = await res.text()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, error: `The server returned an error (HTTP ${res.status}). Try again, or turn on demo mode.` }
  }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (!res.ok || record.success === false) {
    const error = typeof record.error === 'string' ? record.error : `Request failed (HTTP ${res.status})`
    return { ok: false, error }
  }
  return { ok: true, data: body as T }
}
