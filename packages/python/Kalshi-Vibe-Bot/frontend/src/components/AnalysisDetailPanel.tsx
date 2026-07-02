import React from 'react'
import {
  ChevronRight,
  BarChart2, Clock,
} from 'lucide-react'
import {
  AiProvider,
  DecisionAnalysis,
  AnalysisActionTaken,
  aiProviderDisplayName,
  analysisAiProviderId,
} from '../api'
import { AiProviderLogo } from './AiProviderLogo'
import { formatUtcIsoLocal } from '../formatUtcLocal'

function _actionLine(at: AnalysisActionTaken | undefined): string | undefined {
  if (!at) return undefined
  const line = 'summary' in at ? at.summary : undefined
  const legacy = 'reason' in at ? at.reason : undefined
  return line || legacy
}

/** One-line outcome for the analysis footer (plain English). */
export function formatActionTaken(
  at: AnalysisActionTaken | undefined,
  decision: DecisionAnalysis['decision'],
): string {
  if (at?.status === 'executed') {
    const d = new Date(at.at)
    const when = Number.isNaN(d.getTime())
      ? at.at
      : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    const px = at.price.toFixed(2)
    return `Bought ${at.quantity} contracts for $${px}/ea at ${when}`
  }
  const line = _actionLine(at)
  if (line) return line
  if (decision === 'SKIP') return 'Skipped.'
  return '—'
}

export function finiteNum(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Human-readable decision badge (API still uses BUY_YES / BUY_NO). */
export function formatDecisionBadge(d: DecisionAnalysis['decision']): string {
  if (d === 'BUY_YES') return 'Buy YES'
  if (d === 'BUY_NO') return 'Buy NO'
  return d
}

/**
 * Upper-right badge: actual outcome (did we trade?), not only the model's directional signal.
 * When the model says BUY_YES but execution skips (edge gate, liquidity, etc.), still show SKIP.
 */
export function effectiveAnalysisBadgeDecision(a: DecisionAnalysis): DecisionAnalysis['decision'] {
  const at = a.action_taken
  if (at?.status === 'executed') {
    const side = String(at.side || '').toUpperCase()
    if (side === 'YES') return 'BUY_YES'
    if (side === 'NO') return 'BUY_NO'
  }
  if (at?.status === 'skipped' || at?.status === 'no_trade') {
    return 'SKIP'
  }
  return a.decision
}

export function formatVolumeContracts(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(Number(v))) return '—'
  const n = Number(v)
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n.toFixed(0)}`
}

export function formatTimeToExpiry(days: number | null | undefined): string {
  if (days === null || days === undefined || Number.isNaN(Number(days))) return '—'
  const d = Math.max(0, Number(days))
  if (d < 1 / 24) return '< 1h left'
  if (d < 1) return `${Math.max(1, Math.round(d * 24))}h left`
  const rounded = d >= 10 ? Math.round(d) : Math.round(d * 10) / 10
  if (rounded <= 0) return 'Expires today'
  if (rounded === 1) return '1 day left'
  return `${rounded} days left`
}

export function expiryToneClass(days: number | null | undefined): string {
  if (days === null || days === undefined || Number.isNaN(Number(days))) return 'text-white'
  const dn = Number(days)
  if (dn <= 1) return 'text-red-400'
  if (dn <= 3) return 'text-amber-400'
  return 'text-white'
}

/** Latest analysis row for a market (by timestamp). */
export function latestAnalysisForMarket(
  analyses: DecisionAnalysis[],
  marketId: string,
): DecisionAnalysis | undefined {
  let best: DecisionAnalysis | undefined
  let bestT = Number.NEGATIVE_INFINITY
  const mid = marketId.trim()
  const midU = mid.toUpperCase()
  for (const a of analyses) {
    const aid = String(a.market_id ?? '').trim()
    if (aid !== mid && aid.toUpperCase() !== midU) continue
    const t = Date.parse(a.timestamp.endsWith('Z') ? a.timestamp : `${a.timestamp}Z`)
    const tt = Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
    if (tt >= bestT) {
      bestT = tt
      best = a
    }
  }
  return best
}

/**
 * Prefer the sliding-window analyses feed, then per-ticker maps from the dashboard bundle or closed-positions payload
 * (latest ``DecisionLog`` per ticker — avoids missing detail when the feed cap drops a ticker).
 */
export function analysisForOpenMarket(
  feed: DecisionAnalysis[],
  bundleByMarketId: Record<string, DecisionAnalysis> | undefined,
  marketId: string,
): DecisionAnalysis | undefined {
  const fromFeed = latestAnalysisForMarket(feed, marketId)
  if (fromFeed) return fromFeed
  if (!bundleByMarketId) return undefined
  const k = marketId.trim()
  const u = k.toUpperCase()
  return bundleByMarketId[k] ?? bundleByMarketId[u]
}

/** Prefer per-position ``entry_analysis`` (saved at open); else latest-by-ticker (see ``analysisForOpenMarket``). */
export function analysisForPositionRow(
  pos: { market_id: string; entry_analysis?: DecisionAnalysis | null | undefined },
  feed: DecisionAnalysis[],
  bundleByMarketId: Record<string, DecisionAnalysis> | undefined,
): DecisionAnalysis | undefined {
  if (pos.entry_analysis) return pos.entry_analysis
  return analysisForOpenMarket(feed, bundleByMarketId, pos.market_id)
}

export const AnalysisMarketSnapshot: React.FC<{ a: DecisionAnalysis }> = ({ a }) => {
  const yesMid =
    finiteNum(a.yes_price) ??
    (a.yes_confidence != null ? finiteNum(a.yes_confidence / 100) : undefined)
  const noMid =
    finiteNum(a.no_price) ??
    (a.no_confidence != null ? finiteNum(a.no_confidence / 100) : undefined)
  const vol = finiteNum(a.volume)
  const days =
    a.expires_in_days === null || a.expires_in_days === undefined
      ? undefined
      : finiteNum(a.expires_in_days)

  const has =
    yesMid !== undefined ||
    noMid !== undefined ||
    vol !== undefined ||
    days !== undefined

  if (!has) return null

  const y = yesMid !== undefined ? `${Math.round(yesMid * 100)}¢` : '—'
  const n = noMid !== undefined ? `${Math.round(noMid * 100)}¢` : '—'

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-6">
        <div>
          <p className="text-[10px] text-white uppercase tracking-wide">Yes</p>
          <p className="text-xl font-bold text-emerald-400 leading-tight">{y}</p>
        </div>
        <div>
          <p className="text-[10px] text-white uppercase tracking-wide">No</p>
          <p className="text-xl font-bold text-red-400 leading-tight">{n}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs pt-2 border-t border-brand-muted/25">
        <span
          className="inline-flex items-center gap-1.5 text-white"
          title="Contract volume (not dollars)"
        >
          <BarChart2 className="w-3.5 h-3.5 shrink-0 opacity-85" />
          {formatVolumeContracts(vol)}
        </span>
        <span className={`inline-flex items-center gap-1.5 ${expiryToneClass(days)}`}>
          <Clock className="w-3.5 h-3.5 shrink-0 opacity-85" />
          {formatTimeToExpiry(days)}
        </span>
      </div>
    </div>
  )
}

/** Same AI analysis block as the Dashboard feed card (without outer list chrome). */
export const AnalysisDetailBody: React.FC<{
  a: DecisionAnalysis
  /** When the saved blob lacks provider (legacy rows), use active Settings provider. */
  fallbackProvider?: AiProvider | null
}> = ({ a, fallbackProvider }) => {
  const [ctxOpen, setCtxOpen] = React.useState(false)
  const badgeDecision = effectiveAnalysisBadgeDecision(a)
  const badgeYes = badgeDecision === 'BUY_YES'
  const badgeNo = badgeDecision === 'BUY_NO'

  const aiYes = a.ai_probability_yes_pct ?? Math.round((a.confidence ?? 0) * 100)
  const aiNo = Math.max(0, Math.min(100, 100 - aiYes))
  const recSide = a.decision === 'BUY_YES' ? 'YES' : a.decision === 'BUY_NO' ? 'NO' : null
  const aiForSide = recSide === 'YES' ? aiYes : recSide === 'NO' ? aiNo : null
  const mImpl = a.market_implied_probability_pct
  const edgePts = a.edge_pct ?? a.edge
  const kelly = a.kelly_contracts ?? 0
  const batchLegId = (a.xai_analysis?.event_batch && String(a.market_id || '').trim()) || ''

  const badgeStyles = badgeYes
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : badgeNo
      ? 'bg-red-500/20 text-red-400 border-red-500/30'
      : 'bg-brand-muted/15 text-white border-brand-muted/30'

  const analysisProvider = analysisAiProviderId(a, fallbackProvider)

  const time = formatUtcIsoLocal(a.timestamp, '—', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="ui-surface-sm group p-3.5 transition hover:border-white/35">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white leading-snug">{a.market_title}</p>
          <AnalysisMarketSnapshot a={a} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {analysisProvider ? <AiProviderLogo provider={analysisProvider} className="h-9 w-9" /> : null}
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${badgeStyles}`}>
            {formatDecisionBadge(badgeDecision)}
          </span>
        </div>
      </div>

      {a.escalated_to_xai && (
        <div className="mb-2 rounded-lg border border-brand-muted/30 bg-primary/35 p-3 space-y-2">
          <p className="text-[10px] text-sky-300/90 font-medium">
            Analyzed by {aiProviderDisplayName(analysisProvider ?? a.xai_analysis?.provider ?? a.ai_analysis?.provider)}
            {a.xai_analysis?.model ? (
              <span className="text-white/50 font-normal"> · {a.xai_analysis.model}</span>
            ) : null}
          </p>
          <p className="text-[10px] text-white/60 leading-relaxed">
            <span className="text-white/75 font-semibold">AI P(YES):</span> Model&apos;s chance this contract{' '}
            <strong className="text-white/90">settles YES</strong> (one YES figure).
            <span className="mx-1.5 text-white/35">·</span>
            <span className="text-white/75 font-semibold">AI P(side):</span> P for the recommended buy side—YES pick ={' '}
            <strong className="text-white/90">P(YES)</strong>; NO pick = <strong className="text-white/90">100 − P(YES)</strong>
            {a.xai_analysis?.event_batch ? (
              <>
                <span className="mx-1.5 text-white/35">·</span>
                Batch: <strong className="text-white/90">leg id</strong> = Kalshi ticker; map it to the partition list
                below.
              </>
            ) : (
              <>.</>
            )}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p
                className="text-[10px] uppercase tracking-wide text-white/65"
                title="Executable ask on the side we would buy, as an implied win probability (0–100%)."
              >
                Market implied (buy side)
              </p>
              <p className="text-lg font-bold text-white tabular-nums">
                {mImpl != null && mImpl > 0 ? `${mImpl}%` : '—'}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] uppercase tracking-wide text-white/65"
                title="Model’s estimated probability (0–100%) that this contract resolves YES at settlement."
              >
                AI P(YES)
              </p>
              <p className="text-lg font-bold text-sky-300 tabular-nums">{aiYes}%</p>
            </div>
            <div>
              <p
                className="text-[10px] uppercase tracking-wide text-white/65"
                title={
                  a.xai_analysis?.event_batch
                    ? 'Probability for the recommended buy side on the leg shown below (Kalshi market_id). Compare to the partition list.'
                    : 'If the recommendation is BUY YES, same as P(YES). If BUY NO, equals 100 − P(YES) (probability NO wins).'
                }
              >
                AI P(side)
              </p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  recSide === 'YES' ? 'text-emerald-400' : recSide === 'NO' ? 'text-red-400' : 'text-white/50'
                }`}
              >
                {aiForSide != null ? `${aiForSide}%` : '—'}
              </p>
              <p className="text-[10px] text-white/55 mt-0.5 break-all">
                {recSide
                  ? batchLegId
                    ? `Recommended: ${recSide} · leg ${batchLegId}`
                    : `Recommended: ${recSide}`
                  : 'SKIP'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-white/65">Edge</p>
              <p
                className={`text-lg font-bold tabular-nums ${
                  edgePts > 0 ? 'text-emerald-400' : edgePts < 0 ? 'text-red-400' : 'text-white'
                }`}
              >
                {Number.isFinite(edgePts) ? `${edgePts >= 0 ? '+' : ''}${edgePts.toFixed(1)} pts` : '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-brand-muted/25 text-xs">
            <div>
              <span className="text-white/70">Full Kelly size </span>
              <span className="font-semibold text-amber-300 tabular-nums">{kelly}</span>
              <span className="text-white/70"> contracts</span>
            </div>
          </div>
        </div>
      )}

      {a.xai_analysis?.event_batch && (
        <p className="text-[10px] uppercase tracking-wide text-sky-400/90 mb-1">
          Event batch
          {a.xai_analysis.event_leg_count != null
            ? ` · ${a.xai_analysis.event_leg_count} contracts compared`
            : ''}
        </p>
      )}
      {a.xai_analysis?.event_batch && a.xai_analysis.outcome_probability_pct_by_market_id && (
        <div className="mb-2 rounded border border-sky-500/20 bg-sky-500/5 px-2 py-1.5 text-[10px] text-white/80 leading-snug">
          <span className="text-sky-300/95 font-semibold">Mutually exclusive P(YES) by leg</span>
          <span className="text-white/50"> (model partition; ~100% across listed ids)</span>
          <ul className="mt-1 space-y-0.5 font-mono text-[9px] text-white/90">
            {Object.entries(a.xai_analysis.outcome_probability_pct_by_market_id).map(([mid, pct]) => {
              const pick =
                batchLegId && mid.trim().toUpperCase() === batchLegId.trim().toUpperCase()
              return (
                <li key={mid} className={`break-all ${pick ? 'text-sky-200 font-semibold' : ''}`}>
                  <span className={pick ? 'text-sky-100' : 'text-white/60'}>{mid}</span> → {pct}%
                  {pick ? ' ← recommended leg' : ''}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {a.reasoning && (
        <p className="text-xs text-white leading-relaxed line-clamp-3 mb-2">{a.reasoning}</p>
      )}

      {a.real_time_context && a.escalated_to_xai && (
        <div>
          <button
            type="button"
            onClick={() => setCtxOpen(!ctxOpen)}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition mb-1"
          >
            <img
              src="/flying-money.png"
              alt=""
              className="w-3 h-3 object-contain"
            />
            Real-time context
            <ChevronRight className={`w-3 h-3 transition-transform ${ctxOpen ? 'rotate-90' : ''}`} />
          </button>
          {ctxOpen && (
            <p className="text-xs text-white leading-relaxed pl-4 border-l border-blue-500/30">
              {a.real_time_context}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-white mt-2 pt-2 border-t border-brand-muted/25">
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          <span className="text-white shrink-0">Action:</span>
          <span className="text-white min-w-0 break-words">
            {formatActionTaken(a.action_taken, a.decision)}
          </span>
        </div>
        <span className="shrink-0 ml-3">{time}</span>
      </div>
    </div>
  )
}
