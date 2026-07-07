import type { Position } from './api'

function isoStrictlyBefore(a: string, b: string): boolean {
  const da = Date.parse(a.trim())
  const db = Date.parse(b.trim())
  if (Number.isNaN(da) || Number.isNaN(db)) return false
  return da < db
}

/** ISO for Ends — mirrors server ``position_display_ends_iso`` (hybrid Option C uses ``nowMs``). */
export function positionEndsAtIso(
  p: Pick<Position, 'ends_at' | 'expected_expiration_time' | 'close_time' | 'kalshi_market_status'>,
  nowMs: number = Date.now(),
): string | undefined {
  const st = (p.kalshi_market_status ?? '').trim().toLowerCase()
  if (st === 'closed' || st === 'determined' || st === 'finalized' || st === 'settled') {
    const ct = (p.close_time ?? '').trim()
    if (ct) return ct
  }
  const exp = (p.expected_expiration_time ?? '').trim()
  const ct = (p.close_time ?? '').trim()
  const tradeable = st === 'active' || st === 'open'
  if (tradeable && exp && ct && isoStrictlyBefore(exp, ct)) {
    const peg = Date.parse(exp)
    if (!Number.isNaN(peg) && peg <= nowMs) return ct
  }
  if (exp) return exp
  if (ct) return ct
  return (p.ends_at ?? '').trim() || undefined
}

/** Tradeable row whose Kalshi ``expected_expiration_time`` peg is already in the past (schedule slip / live play). */
export function tradeableExpectedExpirationPassed(
  p: Pick<Position, 'kalshi_market_status' | 'expected_expiration_time'>,
  nowMs: number,
): boolean {
  const st = (p.kalshi_market_status ?? '').trim().toLowerCase()
  if (st !== 'active' && st !== 'open') return false
  const raw = (p.expected_expiration_time ?? '').trim()
  if (!raw) return false
  const peg = Date.parse(raw)
  if (Number.isNaN(peg)) return false
  return peg <= nowMs
}

/** Sort key for time-left: delayed tradeable rows use the peg so they sort as near-term, not by far contractual close. */
export function positionSortEndsAtIso(
  p: Pick<Position, 'ends_at' | 'expected_expiration_time' | 'close_time' | 'kalshi_market_status'>,
  nowMs: number = Date.now(),
): string | undefined {
  if (tradeableExpectedExpirationPassed(p, nowMs)) {
    const peg = (p.expected_expiration_time ?? '').trim()
    if (peg) return peg
  }
  return positionEndsAtIso(p, nowMs)
}

/** True when ``closeTimeIso`` parses and is not after ``nowMs``. */
export function isCloseTimePassed(closeTimeIso: string | undefined, nowMs: number): boolean {
  if (!closeTimeIso?.trim()) return false
  const end = Date.parse(closeTimeIso)
  if (Number.isNaN(end)) return false
  return end - nowMs <= 0
}

/** Compact label for table columns (e.g. ``10.6h``, ``1.2d``, ``45m``). */
export function formatTimeLeft(closeTimeIso: string | undefined, nowMs: number): string {
  if (!closeTimeIso?.trim()) return '—'
  const end = Date.parse(closeTimeIso)
  if (Number.isNaN(end)) return '—'
  const ms = end - nowMs
  if (ms <= 0) return 'Ended'
  const days = ms / 86_400_000
  if (days >= 1) return `${days.toFixed(1)}d`
  const hours = ms / 3_600_000
  if (hours >= 1) return `${hours.toFixed(1)}h`
  const mins = Math.max(1, Math.round(ms / 60_000))
  return `${mins}m`
}
