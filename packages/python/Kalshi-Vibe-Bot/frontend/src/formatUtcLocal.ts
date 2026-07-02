/**
 * Parse API timestamps as UTC (naive ISO strings are treated as UTC), then format in local time.
 */

const HAS_TZ_SUFFIX = /[zZ]$|[+-]\d{2}:?\d{2}$/

function normalizeIsoForJsParse(iso: string): string {
  const t = iso.trim()
  if (!t) return t
  const withTz = HAS_TZ_SUFFIX.test(t) ? t : `${t}Z`
  // Python may emit microseconds; trim past ms for engines that choke on long fractions.
  return withTz.replace(/(\.\d{3})\d+(?=Z|[+-])/, '$1')
}

/** Parse API UTC timestamp to epoch ms, or null if invalid. */
export function parseUtcIsoToMs(iso: string | null | undefined): number | null {
  if (iso == null || String(iso).trim() === '') return null
  const raw = String(iso).trim()
  let ms = Date.parse(normalizeIsoForJsParse(raw))
  if (!Number.isNaN(ms)) return ms
  const truncated = raw.replace(/(\.\d{3})\d+/, '$1')
  if (truncated !== raw) ms = Date.parse(normalizeIsoForJsParse(truncated))
  return Number.isNaN(ms) ? null : ms
}

/** Format a UTC ISO string in the user's local timezone. */
export function formatUtcIsoLocal(
  iso: string | null | undefined,
  empty = '—',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'medium' },
): string {
  const ms = parseUtcIsoToMs(iso)
  if (ms === null) return empty
  return new Date(ms).toLocaleString(undefined, options)
}
