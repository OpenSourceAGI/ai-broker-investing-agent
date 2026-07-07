import React, { Fragment, useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { Position } from '../api'
import { DecisionAnalysis, apiClient } from '../api'
import { useDashboardDataCache } from '../context/DashboardDataCache'
import { TrendingUp, TrendingDown, Loader2, ChevronDown, ChevronUp, Clock, ArrowUpDown } from 'lucide-react'
import { AnalysisDetailBody, analysisForPositionRow } from './AnalysisDetailPanel'
import { formatUtcIsoLocal } from '../formatUtcLocal'
import { positionSortEndsAtIso } from '../formatTimeLeft'
import { formatContractPriceCents, positionCashInvestedUsd } from '../utils/positionBasis'
import { presentOpenPositionRow } from '../utils/positionRowPresentation'

/** Absolute gap below stop threshold (fraction) before showing amber warning. */
const STOP_LOSS_WARN_BELOW_THRESHOLD = 0.05

export type PositionSortKey =
  | 'opened_at'
  | 'market'
  | 'side'
  | 'time_left'
  | 'qty'
  | 'invested'
  | 'entry'
  | 'current'
  | 'pnl'

type PositionSortDir = 'asc' | 'desc'

interface PositionSortState {
  key: PositionSortKey
  dir: PositionSortDir
}

/** Single reducer dispatch avoids nested ``setState`` updaters (Strict Mode double-invokes cancel toggles). */
function positionSortReducer(state: PositionSortState, action: { type: 'toggle'; key: PositionSortKey }): PositionSortState {
  if (state.key === action.key) {
    return { ...state, dir: state.dir === 'asc' ? 'desc' : 'asc' }
  }
  return {
    key: action.key,
    dir: action.key === 'opened_at' ? 'desc' : 'asc',
  }
}

const POSITION_SORT_INITIAL: PositionSortState = { key: 'time_left', dir: 'asc' }

/** Stable header control — must not be defined inside ``PositionsTable`` or buttons remount every parent render. */
function SortHeader({
  columnKey,
  label,
  align = 'left',
  activeKey,
  onToggleColumn,
}: {
  columnKey: PositionSortKey
  label: string
  align?: 'left' | 'right'
  activeKey: PositionSortKey
  onToggleColumn: (k: PositionSortKey) => void
}) {
  const active = activeKey === columnKey
  return (
    <button
      type="button"
      onClick={() => onToggleColumn(columnKey)}
      className={`inline-flex items-center gap-1.5 hover:text-white transition ${align === 'right' ? 'justify-end w-full' : ''}`}
    >
      <span>{label}</span>
      <ArrowUpDown className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-white'}`} aria-hidden />
    </button>
  )
}

export type StopLossDrawdownUi = { pct: number; level: 'warning' | 'trigger'; thresholdPct: number }

function entryPricePerContractForStop(pos: Position): number | null {
  let entryPx = Number(pos.entry_price)
  if (!Number.isFinite(entryPx) || entryPx <= 1e-12) {
    const q = Math.max(0, Math.round(Number(pos.quantity) || 0))
    const ec = Number(pos.entry_cost)
    if (q <= 0 || !Number.isFinite(ec) || ec <= 1e-12) return null
    entryPx = ec / q
  }
  if (!Number.isFinite(entryPx) || entryPx <= 1e-12) return null
  return Math.max(0, Math.min(1, entryPx))
}

/**
 * Mark drawdown: ``(entry − Est. Value) / entry`` per contract — same rule as the bot
 * (``stop_loss_triggered_from_position``), fees excluded. Close column shows this % vs Settings threshold.
 * - ``trigger``: at or past stop threshold (red).
 * - ``warning``: within 5 percentage points of threshold but not yet there (yellow).
 * Null when still in grace, Est. Value unknown, unusable entry, or drawdown is below the warning band.
 */
export function stopLossDrawdownDisplay(pos: Position, nowMs: number): StopLossDrawdownUi | null {
  const graceMin = Number(pos.exit_grace_minutes ?? 10)
  const opened = Date.parse(pos.opened_at)
  if (!Number.isFinite(opened)) return null
  const ageMin = (nowMs - opened) / 60_000
  if (!Number.isFinite(ageMin) || ageMin < graceMin) return null

  const slRaw =
    pos.stop_loss_drawdown_effective ??
    pos.stop_loss_drawdown_pct_at_entry
  const sl = Number(slRaw)
  if (!Number.isFinite(sl) || sl <= 0) return null
  const thresholdPct = Math.round(sl * 100)

  const entryPx = entryPricePerContractForStop(pos)
  if (entryPx === null) return null

  const estRaw = pos.estimated_price
  if (estRaw == null || !Number.isFinite(Number(estRaw))) return null
  let estPx = Number(estRaw)
  if (!Number.isFinite(estPx)) return null
  estPx = Math.max(0, Math.min(1, estPx))

  const dd = (entryPx - estPx) / entryPx
  if (!Number.isFinite(dd)) return null

  const pct = Math.round(dd * 100)
  if (dd >= sl - 1e-9) {
    return { pct, level: 'trigger', thresholdPct }
  }
  const warnFloor = Math.max(0, sl - STOP_LOSS_WARN_BELOW_THRESHOLD)
  if (dd >= warnFloor - 1e-9) {
    return { pct, level: 'warning', thresholdPct }
  }
  return null
}

export interface PositionsTableProps {
  tradingMode?: 'paper' | 'live'
  analyses: DecisionAnalysis[]
  expandedDetailKey: string | null
  onToggleDetail: (key: string) => void
}

export const PositionsTable: React.FC<PositionsTableProps> = ({
  tradingMode = 'paper',
  analyses,
  expandedDetailKey,
  onToggleDetail,
}) => {
  const {
    portfolio,
    positions: cachedPositions,
    setPositions: setCachedPositions,
    setPortfolio,
    positionAnalysesByMarketId,
    setPositionAnalysesByMarketId,
  } = useDashboardDataCache()
  const stopLossAutoSellsEnabled = portfolio?.stop_loss_selling_enabled === true
  const loading = cachedPositions === null
  const [closing, setClosing] = useState<string | null>(null)
  /** After a failed manual sell, show RETRY instead of SELL until success or row disappears. */
  const [sellRetryByPositionId, setSellRetryByPositionId] = useState<Record<string, boolean>>({})
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [sort, dispatchSort] = useReducer(positionSortReducer, POSITION_SORT_INITIAL)
  const positions = cachedPositions ?? []

  const toggleSortColumn = useCallback((key: PositionSortKey) => {
    dispatchSort({ type: 'toggle', key })
  }, [])

  /** Align with dashboard tiles + open legs after manual actions / WS (polling runs on Dashboard only). */
  const refreshOpenFromBundle = useCallback(async () => {
    try {
      const b = await apiClient.getDashboardBundle()
      setCachedPositions(b.positions)
      setPortfolio(b.portfolio)
      setPositionAnalysesByMarketId(b.position_analyses ?? {})
      setNowMs(Date.now())
    } catch (e) {
      console.error('Dashboard bundle refresh (positions table):', e)
    }
  }, [setCachedPositions, setPortfolio, setPositionAnalysesByMarketId])

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  /** Only Ends sorting depends on the live clock — avoid full resort every 30s for other columns. */
  const sortTimeDependency = sort.key === 'time_left' ? nowMs : 0

  const sortedPositions = useMemo(() => {
    const safeDate = (iso?: string) => {
      const t = Date.parse(iso ?? '')
      return Number.isNaN(t) ? -Infinity : t
    }
    const safeNum = (n: unknown) => {
      const v = Number(n)
      return Number.isFinite(v) ? v : 0
    }
    const safeStr = (s: unknown) => String(s ?? '').toLowerCase()

    const dir = sort.dir === 'asc' ? 1 : -1
    const rows = positions.map((p, idx) => ({ p, idx }))
    rows.sort((a, b) => {
      const pa = a.p
      const pb = b.p

      let cmp = 0
      switch (sort.key) {
        case 'opened_at':
          cmp = safeDate(pa.opened_at) - safeDate(pb.opened_at)
          break
        case 'market':
          cmp = safeStr(pa.market_title || pa.market_id).localeCompare(safeStr(pb.market_title || pb.market_id))
          break
        case 'side':
          cmp = safeStr(pa.side).localeCompare(safeStr(pb.side))
          break
        case 'time_left':
          cmp =
            safeDate(positionSortEndsAtIso(pa, nowMs)) - safeDate(positionSortEndsAtIso(pb, nowMs))
          break
        case 'qty':
          cmp = safeNum(pa.quantity) - safeNum(pb.quantity)
          break
        case 'invested': {
          const inv = (p: Position) =>
            positionCashInvestedUsd({
              entry_cost: p.entry_cost,
              entry_price: p.entry_price,
              quantity: p.quantity,
              fees_paid: p.fees_paid,
            })
          cmp = inv(pa) - inv(pb)
          break
        }
        case 'entry':
          cmp = safeNum(pa.entry_price) - safeNum(pb.entry_price)
          break
        case 'current': {
          const estKey = (p: Position) =>
            p.resolution_outcome_pending
              ? sort.dir === 'asc'
                ? Number.POSITIVE_INFINITY
                : Number.NEGATIVE_INFINITY
              : safeNum(p.estimated_price ?? p.bid_price ?? p.current_price)
          cmp = estKey(pa) - estKey(pb)
          break
        }
        case 'pnl': {
          const pnlKey = (p: Position) =>
            p.unrealized_pnl === null || p.unrealized_pnl === undefined
              ? sort.dir === 'asc'
                ? Number.POSITIVE_INFINITY
                : Number.NEGATIVE_INFINITY
              : safeNum(p.unrealized_pnl)
          cmp = pnlKey(pa) - pnlKey(pb)
          break
        }
      }

      if (cmp !== 0) return cmp * dir
      // Stable fallback
      return a.idx - b.idx
    })
    return rows.map((r) => r.p)
  }, [positions, sort.dir, sort.key, sortTimeDependency])

  useEffect(() => {
    const ids = new Set((cachedPositions ?? []).map((p) => p.id))
    setSellRetryByPositionId((prev) => {
      let changed = false
      const next = { ...prev }
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [cachedPositions])

  const handleClose = async (position: Position) => {
    const retry = Boolean(sellRetryByPositionId[position.id])
    const confirmMsg = retry
      ? `Retry selling ${position.side} position on "${position.market_title}"?`
      : `Sell ${position.side} position on "${position.market_title}"?`
    if (!window.confirm(confirmMsg)) return
    setClosing(position.id)
    try {
      await apiClient.closePosition(position.id)
      setSellRetryByPositionId((prev) => {
        const next = { ...prev }
        delete next[position.id]
        return next
      })
      await refreshOpenFromBundle()
    } catch (e) {
      console.error('Failed to close position:', e)
      setSellRetryByPositionId((prev) => ({ ...prev, [position.id]: true }))
    } finally {
      setClosing(null)
    }
  }

  if (loading) {
    return <div className="text-white text-sm py-4">Loading positions…</div>
  }

  if (cachedPositions === null) {
    return (
      <div className="ui-surface-sm p-8 text-center">
        <p className="text-white text-sm">Could not load open positions</p>
        <p className="text-white text-xs mt-1">Check the backend and refresh the page</p>
      </div>
    )
  }

  if (positions.length === 0) {
    return (
      <>
        <div className="ui-surface-sm p-8 text-center">
          <p className="text-white text-sm">No open positions</p>
          <p className="text-white text-xs mt-1">Bot will open positions automatically when in Play mode</p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="ui-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1420px]">
          <thead className="border-b border-brand-muted/40 bg-black/30">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-white whitespace-nowrap">
                <SortHeader
                  columnKey="market"
                  label="Market"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-white whitespace-nowrap">
                <SortHeader
                  columnKey="side"
                  label="Side"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase text-white whitespace-nowrap min-w-[11.75rem] w-[11.75rem]">
                <SortHeader
                  columnKey="time_left"
                  label="Ends"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <SortHeader
                  columnKey="qty"
                  label="Qty"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <SortHeader
                  columnKey="invested"
                  label="Invested $"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <SortHeader
                  columnKey="entry"
                  label="Entry"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <SortHeader
                  columnKey="current"
                  label="Est. Value"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <SortHeader
                  columnKey="pnl"
                  label="Net P&L"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <SortHeader
                  columnKey="opened_at"
                  label="Opened"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-white whitespace-nowrap">Details</th>
              <th className="px-2 py-2.5 text-center text-xs font-semibold uppercase text-white whitespace-nowrap w-[8.75rem] min-w-[8.75rem]">
                Close
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/20">
            {sortedPositions.map((pos) => {
              const ui = presentOpenPositionRow(pos, tradingMode, nowMs)
              const pnlNum =
                pos.unrealized_pnl === null || pos.unrealized_pnl === undefined
                  ? null
                  : Number(pos.unrealized_pnl)
              const isPos = pnlNum !== null && pnlNum >= 0
              const investedValue = positionCashInvestedUsd({
                entry_cost: pos.entry_cost,
                entry_price: pos.entry_price,
                quantity: pos.quantity,
                fees_paid: pos.fees_paid,
              })
              const pnlPct =
                pnlNum !== null && investedValue > 0
                  ? ((pnlNum / investedValue) * 100).toFixed(1)
                  : '0.0'
              const pnlTitleLiquid =
                '(qty × YES last trade or best-bid fallback) − invested $. Illiquid rows may still show last trade — selling needs a bid.'
              const pnlTitle =
                ui.outcomePending
                  ? 'Kalshi closed: trading stopped; official yes/no not posted yet.'
                  : ui.settlementPending
                    ? 'Kalshi determined: intrinsic value per contract until settlement credits.'
                    : ui.payoutComplete
                      ? 'Kalshi finalized: intrinsic matches settled payout; row clears when reconcile closes it locally.'
                      : pnlTitleLiquid
              const detailKey = `open:${pos.id}`
              const expanded = expandedDetailKey === detailKey
              const analysis = analysisForPositionRow(pos, analyses, positionAnalysesByMarketId)
              const endsSecondaryClass =
                ui.phase === 'active_dead'
                  ? 'text-amber-500/95 font-semibold uppercase tracking-wide'
                  : ui.phase === 'ended_settlement_pending' || ui.phase === 'ended_payout_complete'
                    ? ui.versusResult === 'won'
                      ? 'text-emerald-400/95 font-medium'
                      : ui.versusResult === 'lost'
                        ? 'text-red-400/85 font-medium'
                        : 'text-white/80 font-normal'
                    : 'text-white/85 font-normal'

              return (
                <Fragment key={pos.id}>
                  <tr className="transition odd:bg-secondary even:bg-stripe hover:brightness-[1.05]">
                    <td className="px-5 py-4 w-[420px]">
                      <p
                        className="text-[13px] leading-snug font-semibold text-white line-clamp-2"
                        title={pos.market_title || pos.market_id}
                      >
                        {pos.market_title || pos.market_id}
                      </p>
                      <p className="text-[11px] text-white truncate" title={pos.market_id}>
                        {pos.market_id}
                      </p>
                      <p className="text-[10px] text-white/55 mt-1 leading-snug">
                        {ui.phase === 'active_liquid' && 'Open · marked to market'}
                        {ui.phase === 'active_dead' && 'Open · illiquid (no bid on your side)'}
                        {ui.phase === 'ended_pending_result' && 'Ended · closed (outcome pending)'}
                        {ui.phase === 'ended_settlement_pending' &&
                          (String(pos.kalshi_market_status ?? '').trim().toLowerCase() === 'closed'
                            ? 'Ended · outcome posted (settlement may still be processing)'
                            : 'Ended · determined (settlement pending)')}
                        {ui.phase === 'ended_payout_complete' && 'Ended · finalized (payout complete on Kalshi)'}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                            pos.side === 'YES' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {pos.side}
                        </span>
                        {ui.postCloseOutcomeKnown && ui.versusResult === 'won' ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/95">
                            Won
                          </span>
                        ) : null}
                        {ui.postCloseOutcomeKnown && ui.versusResult === 'lost' ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-400/90">
                            Lost
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className="px-3 py-4 align-top min-w-[11.75rem] w-[11.75rem]"
                      aria-label="Contract horizon and status"
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <span
                          className="inline-flex items-start gap-1 text-xs text-white tabular-nums leading-tight"
                          title={ui.endsTitle}
                        >
                          <Clock className="w-3 h-3 shrink-0 text-white mt-0.5" aria-hidden />
                          <span className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-white leading-none whitespace-nowrap">{ui.endsPrimary}</span>
                            {ui.endsSecondary ? (
                              <span
                                className={`text-[10px] leading-snug whitespace-nowrap ${endsSecondaryClass}`}
                              >
                                {ui.endsSecondary}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-white">{pos.quantity}</td>
                    <td className="px-5 py-4 text-right text-sm text-white">${investedValue.toFixed(2)}</td>
                    <td className="px-5 py-4 text-right text-sm text-white">{formatContractPriceCents(pos.entry_price)}</td>
                    <td className="px-5 py-4 text-right text-sm text-white tabular-nums align-top">
                      {ui.outcomePending ? (
                        <span className="text-white/55">—</span>
                      ) : (
                        <span>
                          {formatContractPriceCents(
                            Number(pos.estimated_price ?? pos.bid_price ?? pos.current_price),
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right align-top" title={pnlTitle}>
                      {ui.outcomePending ? (
                        <span className="text-xs font-semibold text-white/90">Outcome pending</span>
                      ) : pnlNum === null ? (
                        <span className="text-xs font-semibold text-white/90">—</span>
                      ) : (
                        <div
                          className={`text-sm font-semibold ${ui.pnlIsRealizable ? (isPos ? 'text-green-400' : 'text-red-400') : 'text-white/75'}`}
                        >
                          <div className="flex items-center justify-end gap-1">
                            {ui.pnlIsRealizable ? (
                              isPos ? (
                                <TrendingUp className="w-3.5 h-3.5" />
                              ) : (
                                <TrendingDown className="w-3.5 h-3.5" />
                              )
                            ) : null}
                            ${Math.abs(pnlNum).toFixed(2)}
                          </div>
                          <div
                            className={`text-xs font-normal ${ui.pnlIsRealizable ? 'opacity-75' : 'text-white/55'}`}
                          >
                            <span>
                              {isPos ? '+' : ''}
                              {pnlPct}%
                            </span>
                          </div>
                          {ui.postCloseOutcomeKnown ? (
                            <div className="text-[10px] font-normal text-white/60 mt-0.5">
                              {ui.settlementPending
                                ? 'Vs. invested (intrinsic, settlement pending)'
                                : 'Vs. invested (intrinsic, Kalshi finalized)'}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right text-xs text-white">
                      {formatUtcIsoLocal(pos.opened_at)}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => onToggleDetail(detailKey)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 transition"
                      >
                        {expanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            Hide details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            Show details
                          </>
                        )}
                      </button>
                    </td>
                    <td
                      className="px-2 py-3 text-center align-top w-[8.75rem] min-w-[8.75rem]"
                      title={
                        ui.showSellButton
                          ? 'Sell at best bid via IOC (live) or mark (paper).'
                          : ui.closeHint || 'Exit not offered for this row.'
                      }
                      aria-label={ui.showSellButton ? 'Close position' : `Close unavailable: ${ui.closeHint ?? 'ended or illiquid'}`}
                    >
                      <div className="flex flex-col gap-1 items-center justify-start min-h-[2.5rem]">
                        {ui.showSellButton ? (
                          <button
                            type="button"
                            onClick={() => handleClose(pos)}
                            disabled={closing === pos.id}
                            className="inline-flex min-w-[2.5rem] items-center justify-center rounded-md bg-primary px-1.5 py-[3px] text-[10px] font-semibold uppercase leading-tight tracking-wide text-white shadow-sm shadow-black/25 transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
                            title={
                              sellRetryByPositionId[pos.id]
                                ? 'Retry selling this position'
                                : 'Sell this position'
                            }
                          >
                            {closing === pos.id ? (
                              <span className="inline-flex items-center gap-1">
                                <Loader2 className="h-[11px] w-[11px] shrink-0 animate-spin" aria-hidden />
                                …
                              </span>
                            ) : sellRetryByPositionId[pos.id] ? (
                              'RETRY'
                            ) : (
                              'SELL'
                            )}
                          </button>
                        ) : (
                          <>
                            <span className="inline-block min-w-[2.6rem] text-white/30 select-none text-xs" aria-hidden>
                              —
                            </span>
                            {ui.closeHint ? (
                              <span className="text-[10px] text-white/55 leading-tight text-center max-w-[6.5rem]">
                                {ui.closeHint}
                              </span>
                            ) : null}
                          </>
                        )}
                        {!ui.outcomePending && !ui.postCloseOutcomeKnown ? (
                          <div className="flex flex-col items-center gap-0.5 w-full min-w-0">
                            <span
                              className="text-[10px] text-white/65 tabular-nums leading-tight whitespace-nowrap text-center w-full"
                              title="Best bid on your contract side — what you would receive selling into bids now."
                            >
                              Best bid{' '}
                              <span className="text-white/90">
                                {formatContractPriceCents(Number(pos.bid_price ?? pos.current_price))}
                              </span>
                            </span>
                            {stopLossAutoSellsEnabled
                              ? (() => {
                                  const slUi = stopLossDrawdownDisplay(pos, nowMs)
                                  if (slUi === null) return null
                                  const lim = slUi.thresholdPct
                                  const color =
                                    slUi.level === 'trigger'
                                      ? 'text-red-400'
                                      : 'text-amber-400'
                                  const title =
                                    slUi.level === 'trigger'
                                      ? `(Entry cash basis − Est. Value) / basis (rounded). At or above your stop setting (${lim}%); bot attempts exit after grace when not in Stop mode.`
                                      : `Value drawdown ${slUi.pct}% (rounded; same basis vs Est. Value as the bot). Within 5 percentage points of your ${lim}% stop — not yet at threshold.`
                                  return (
                                    <span
                                      className={`text-[10px] font-semibold tabular-nums leading-tight whitespace-nowrap text-center w-full ${color}`}
                                      title={title}
                                    >
                                      Stop Loss: {slUi.pct}%
                                    </span>
                                  )
                                })()
                              : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr className="bg-black/35">
                      <td colSpan={11} className="border-t border-brand-muted/30 px-5 py-4 align-top">
                        {analysis ? (
                          <AnalysisDetailBody a={analysis} />
                        ) : (
                          <p className="text-sm text-white">
                            No saved AI analysis for this ticker in your decision log yet — usually because this leg never went
                            through a bot scan and AI analysis on this app (common after Kalshi reconcile import). Let Play mode scan it,
                            or run a manual analysis that persists a decision row for this market.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  )
}
