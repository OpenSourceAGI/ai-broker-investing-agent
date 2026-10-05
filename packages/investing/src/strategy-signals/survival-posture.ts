import type { RiskPosture } from './types'

export type SurvivalMode = 'GROWTH' | 'SURVIVAL' | 'RECOVERY' | 'DEFENSIVE' | 'CRITICAL'
export interface SurvivalState {
  mode: SurvivalMode
  pending: SurvivalMode | null
  pendingCount: number
}
const modes: SurvivalMode[] = ['GROWTH', 'SURVIVAL', 'RECOVERY', 'DEFENSIVE', 'CRITICAL']

/** Independent state-machine implementation; upstream ISC notice is incomplete. */
export function initialSurvivalState(): SurvivalState {
  return { mode: 'SURVIVAL', pending: null, pendingCount: 0 }
}

export function updateSurvivalState(
  previous: SurvivalState,
  currentEquity: number,
  initialEquity: number,
  hysteresis = 3
): SurvivalState {
  if (
    !previous ||
    !modes.includes(previous.mode) ||
    (previous.pending !== null && !modes.includes(previous.pending)) ||
    !Number.isSafeInteger(previous.pendingCount) ||
    previous.pendingCount < 0 ||
    !Number.isSafeInteger(hysteresis) ||
    hysteresis < 1 ||
    previous.pendingCount >= hysteresis ||
    (previous.pending === null && previous.pendingCount !== 0)
  )
    throw new Error('invalid survival state')
  if (
    !Number.isFinite(initialEquity) ||
    initialEquity <= 0 ||
    !Number.isFinite(currentEquity) ||
    currentEquity < 0
  )
    throw new Error('invalid survival equity')
  const ratio = currentEquity / initialEquity
  if (!Number.isFinite(ratio)) throw new Error('invalid survival health ratio')
  let next: SurvivalMode
  if (ratio >= 1.2) next = 'GROWTH'
  else if (ratio <= 0.5) next = 'CRITICAL'
  else if (ratio <= 0.85)
    next = previous.mode === 'DEFENSIVE' && ratio > 0.7 ? 'RECOVERY' : 'DEFENSIVE'
  else if (previous.mode === 'RECOVERY' && ratio < 1) next = 'RECOVERY'
  else next = 'SURVIVAL'
  if (next === 'CRITICAL' || next === previous.mode)
    return { mode: next, pending: null, pendingCount: 0 }
  const pendingCount = previous.pending === next ? previous.pendingCount + 1 : 1
  return pendingCount >= hysteresis
    ? { mode: next, pending: null, pendingCount: 0 }
    : { mode: previous.mode, pending: next, pendingCount }
}

/** Approved demo sizing policy, NOT a numeric rule defined by upstream. SELLs bypass entry posture in the common gate. */
export function toSurvivalPosture(state: SurvivalState | SurvivalMode): RiskPosture {
  const label = typeof state === 'string' ? state : state.mode
  if (!modes.includes(label)) throw new Error('invalid survival mode')
  const multipliers: Record<SurvivalMode, number> = {
    GROWTH: 1,
    SURVIVAL: 1,
    RECOVERY: 0.75,
    DEFENSIVE: 0.5,
    CRITICAL: 0
  }
  return { label, sizeMultiplier: multipliers[label], allowNewEntries: label !== 'CRITICAL' }
}
