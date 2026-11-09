/**
 * Read a fetch Response as JSON without throwing on an empty or non-JSON body.
 *
 * Cloudflare answers a timed-out or overloaded Worker (524, 503) with an empty
 * body or an HTML error page, so `await res.json()` throws "Unexpected end of
 * JSON input" and the caller loses the status code. This returns the parsed
 * body when there is one, and otherwise a `{ success: false, error }` payload
 * that names the HTTP status, so callers can branch on `success` as usual.
 */
export async function readJson<T = any>(res: Response): Promise<T> {
  const text = await res.text().catch(() => "")
  if (text.trim()) {
    try {
      return JSON.parse(text) as T
    } catch {
      // Fall through: an HTML error page or a truncated body.
    }
  }
  return {
    success: false,
    status: res.status,
    error: res.ok
      ? "The server sent an empty response"
      : res.status === 524 || res.status === 504
        ? `The request timed out (HTTP ${res.status}). Try a shorter date range.`
        : `The server is unavailable (HTTP ${res.status}). Try again in a moment.`,
  } as T
}
