/**
 * Decides whether /api/groq-debate may call an external debate-analyst
 * service, and at which URL.
 *
 * The route used to fall back to `http://localhost:8001` when no URL was
 * configured. On Cloudflare Workers a fetch to localhost or a bare IP is
 * refused with "error code: 1003", which is exactly what production returned.
 * So a URL is only used when it is configured *and* names a public host;
 * otherwise the caller runs the debate in-process.
 */

type Env = Record<string, string | undefined>

const LOOPBACK_HOSTS = new Set(['localhost', '0.0.0.0', '::1', '[::1]'])
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/** True when a Worker fetch to this host would fail (loopback or bare IP). */
export function isUnreachableFromWorker(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    LOOPBACK_HOSTS.has(host) ||
    host.endsWith('.localhost') ||
    IPV4.test(host) ||
    host.startsWith('[')
  )
}

/**
 * The `/analyze` URL of a configured external debate-analyst service, or
 * `null` when none is configured or the configured one is not reachable from
 * a Worker.
 */
export function resolveDebateAnalystUrl(env: Env): string | null {
  const gateway = env.NEXT_PUBLIC_API_BASE_URL?.trim()
  const direct = (env.DEBATE_ANALYST_URL || env.NEXT_PUBLIC_DEBATE_ANALYST_URL)?.trim()

  const candidate = gateway
    ? `${gateway.replace(/\/+$/, '')}/debate-analyst/analyze`
    : direct
      ? `${direct.replace(/\/+$/, '')}/analyze`
      : null
  if (!candidate) return null

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (isUnreachableFromWorker(url.hostname)) return null
  return url.toString()
}
