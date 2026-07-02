import type { Position } from '../api'
import {
  formatTimeLeft,
  isCloseTimePassed,
  positionEndsAtIso,
  tradeableExpectedExpirationPassed,
} from '../formatTimeLeft'

export type PositionLifecyclePhase =
  | 'active_liquid'
  | 'active_dead'
  | 'ended_pending_result'
  | 'ended_settlement_pending'
  | 'ended_payout_complete'

/** Won/lost vs held side once Kalshi posts yes/no (``determined`` or terminal ``finalized`` / ``settled``). */
export function sideVersusResult(
  pos: Pick<
    Position,
    'side' | 'kalshi_market_result' | 'resolution_awaiting_payout' | 'resolution_kalshi_payout_complete'
  >,
): 'won' | 'lost' | null {
  const known =
    !!pos.resolution_awaiting_payout || !!pos.resolution_kalshi_payout_complete
  if (!known) return null
  const r = String(pos.kalshi_market_result || '')
    .trim()
    .toLowerCase()
  if (r !== 'yes' && r !== 'no') return null
  const side = String(pos.side || '')
    .trim()
    .toUpperCase()
  if (side === 'YES') return r === 'yes' ? 'won' : 'lost'
  if (side === 'NO') return r === 'no' ? 'won' : 'lost'
  return null
}

export interface PositionRowPresentation {
  endsAtIso?: string
  /** Display horizon (event end / contractual fallback) has passed. */
  eventClockEnded: boolean
  outcomePending: boolean
  /** Kalshi ``determined``: official yes/no, settlement cash still pending. */
  settlementPending: boolean
  /** Kalshi ``finalized`` / ``settled``: exchange reports payouts complete. */
  payoutComplete: boolean
  /** Post-close with intrinsic mark (either settlement pending or finalized on exchange). */
  postCloseOutcomeKnown: boolean
  phase: PositionLifecyclePhase
  /** Open market but no workable bid on held side — cannot IOC-exit at bid. */
  deadWhileOpen: boolean
  versusResult: 'won' | 'lost' | null
  showSellButton: boolean
  /** Short label when Close shows no button (paper + live). */
  closeHint?: string
  /** Primary line for Ends column (countdown or status word). */
  endsPrimary: string
  /** Sub-line under Ends (phase hint). */
  endsSecondary?: string
  /** Tooltip for Ends stack. */
  endsTitle: string
  /** Whether dollar P&L is meaningful for exit planning. */
  pnlIsRealizable: boolean
}

export function presentOpenPositionRow(
  pos: Position,
  tradingMode: 'paper' | 'live',
  nowMs: number,
): PositionRowPresentation {
  const endsAtIso = positionEndsAtIso(pos, nowMs)
  const eventClockEnded = isCloseTimePassed(endsAtIso, nowMs)
  const delayedSchedule = tradeableExpectedExpirationPassed(pos, nowMs)
  const outcomePending = !!pos.resolution_outcome_pending
  const settlementPending = !!pos.resolution_awaiting_payout
  const payoutComplete = !!pos.resolution_kalshi_payout_complete
  const postCloseOutcomeKnown = settlementPending || payoutComplete

  const bidUsd = Number(pos.bid_price ?? pos.current_price)
  const bidLooksEmpty = !Number.isFinite(bidUsd) || bidUsd <= 0
  const flaggedDead = tradingMode === 'live' && !!pos.dead_market

  const deadWhileOpen =
    !eventClockEnded &&
    !outcomePending &&
    !postCloseOutcomeKnown &&
    (flaggedDead || bidLooksEmpty)

  let phase: PositionLifecyclePhase
  if (!eventClockEnded) {
    phase = deadWhileOpen ? 'active_dead' : 'active_liquid'
  } else if (payoutComplete) {
    phase = 'ended_payout_complete'
  } else if (settlementPending) {
    phase = 'ended_settlement_pending'
  } else if (outcomePending) {
    phase = 'ended_pending_result'
  } else {
    phase = 'ended_pending_result'
  }

  const versusResult = sideVersusResult(pos)

  const postEventResolvedFlow = outcomePending || postCloseOutcomeKnown
  const showSellButton = !postEventResolvedFlow && !deadWhileOpen && !eventClockEnded

  let closeHint: string | undefined
  if (!showSellButton) {
    if (outcomePending) closeHint = 'Awaiting outcome'
    else if (settlementPending) closeHint = 'Settlement pending'
    else if (payoutComplete) closeHint = 'Finalized'
    else if (deadWhileOpen) closeHint = 'No bid'
    else if (eventClockEnded) closeHint = 'Ended'
  }

  let endsPrimary: string
  let endsSecondary: string | undefined
  let endsTitle: string

  if (!eventClockEnded) {
    if (delayedSchedule) {
      endsPrimary = 'Delayed'
      endsSecondary = deadWhileOpen ? 'Illiquid' : undefined
      endsTitle = deadWhileOpen
        ? 'Listed expected end has passed — no bid on your side; exits wait until bids return or you hold to resolution.'
        : 'Listed expected end time has passed while the contract is still open; Kalshi will update status or result as the market resolves.'
    } else {
      endsPrimary = formatTimeLeft(endsAtIso, nowMs)
      endsSecondary = deadWhileOpen ? 'Illiquid' : undefined
      endsTitle = deadWhileOpen
        ? 'Event not over yet — no bid on your side; exits wait until bids return or you hold to resolution.'
        : `Time until display horizon (${endsAtIso ?? 'unknown'})`
    }
  } else if (outcomePending) {
    endsPrimary = 'Ended'
    endsSecondary = 'Outcome pending'
    endsTitle =
      'Kalshi status "closed": trading has stopped; the official yes/no outcome is not posted yet for this contract.'
  } else if (settlementPending) {
    const stKal = String(pos.kalshi_market_status ?? '').trim().toLowerCase()
    endsPrimary = 'Ended'
    endsSecondary =
      versusResult === 'won'
        ? 'Won · settlement pending'
        : versusResult === 'lost'
          ? 'Lost · settlement pending'
          : 'Settlement pending'
    endsTitle =
      stKal === 'closed'
        ? 'Kalshi status "closed" with an outcome already present: trading is stopped; settlement may still be processing before "determined" / "finalized" appear in the API.'
        : 'Kalshi status "determined": the outcome is official; settlement cash may still be posting to your account.'
  } else if (payoutComplete) {
    endsPrimary = 'Ended'
    endsSecondary =
      versusResult === 'won'
        ? 'Won · finalized'
        : versusResult === 'lost'
          ? 'Lost · finalized'
          : 'Finalized'
    endsTitle =
      'Kalshi status "finalized" (or "settled"): payouts are complete on the exchange. This row disappears when reconcile closes it locally.'
  } else {
    endsPrimary = 'Ended'
    endsSecondary = undefined
    endsTitle = 'Past display horizon — refresh marks if this looks wrong.'
  }

  let pnlIsRealizable = false
  if (outcomePending) pnlIsRealizable = false
  else if (postCloseOutcomeKnown) pnlIsRealizable = true
  else if (deadWhileOpen) pnlIsRealizable = false
  else pnlIsRealizable = true

  return {
    endsAtIso,
    eventClockEnded,
    outcomePending,
    settlementPending,
    payoutComplete,
    postCloseOutcomeKnown,
    phase,
    deadWhileOpen,
    versusResult,
    showSellButton,
    closeHint,
    endsPrimary,
    endsSecondary,
    endsTitle,
    pnlIsRealizable,
  }
}
