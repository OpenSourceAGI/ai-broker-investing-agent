import React, { Fragment, useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { ClosedPosition } from '../api'
import { apiClient, DecisionAnalysis } from '../api'
import { useDashboardDataCache } from '../context/DashboardDataCache'
import { DASHBOARD_POLL_INTERVAL_MS } from '../dashboardPolling'
import { useWebSocket } from '../hooks/useWebSocket'
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ArrowUpDown, Check, X } from 'lucide-react'
import { AnalysisDetailBody, analysisForPositionRow } from './AnalysisDetailPanel'
import { formatUtcIsoLocal } from '../formatUtcLocal'
import { formatContractPriceCents, positionCashInvestedUsd } from '../utils/positionBasis'

export type ClosedPositionSortKey =
  | 'closed_at'
  | 'opened_at'
  | 'market'
  | 'side'
  | 'qty'
  | 'invested'
  | 'entry'
  | 'exit'
  | 'pnl'

interface ClosedSortState {
  key: ClosedPositionSortKey
  dir: 'asc' | 'desc'
}

function closedSortReducer(
  state: ClosedSortState,
  action: { type: 'toggle'; key: ClosedPositionSortKey },
): ClosedSortState {
  if (state.key === action.key) {
    return { ...state, dir: state.dir === 'asc' ? 'desc' : 'asc' }
  }
  return {
    key: action.key,
    dir: action.key === 'closed_at' ? 'desc' : 'asc',
  }
}

const CLOSED_SORT_INITIAL: ClosedSortState = { key: 'closed_at', dir: 'desc' }

function ClosedSortHeader({
  columnKey,
  label,
  align = 'left',
  activeKey,
  onToggleColumn,
}: {
  columnKey: ClosedPositionSortKey
  label: string
  align?: 'left' | 'right'
  activeKey: ClosedPositionSortKey
  onToggleColumn: (k: ClosedPositionSortKey) => void
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

/** Whole contracts only (matches bot / Kalshi ``count``). */
function formatContracts(n: number): string {
  const x = Math.max(0, Math.round(Number(n) || 0))
  return String(x)
}

/** Closed-row Kalshi outcome for UI (`yes` / `no` only). */
function kalshiOutcomeLabel(raw: ClosedPosition['kalshi_market_result']): 'YES' | 'NO' | null {
  const r = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return r === 'yes' || r === 'no' ? (r.toUpperCase() as 'YES' | 'NO') : null
}

/** Match backend ``infer_closed_contract_quantity`` (stored qty, else cost ÷ avg, whole contracts). */
function displayClosedQuantity(p: ClosedPosition): number {
  const stored = Math.max(0, Math.round(Number(p.quantity ?? 0)))
  if (stored > 0) return stored
  const ec = Number(p.entry_cost ?? 0)
  const ep = Number(p.entry_price ?? 0)
  if (!Number.isFinite(ec) || !Number.isFinite(ep) || ec <= 1e-12 || ep <= 1e-12) return 0
  const ratio = ec / ep
  if (ratio <= 1e-12 || ratio > 500_000) return 0
  const n = Math.round(ratio)
  if (Math.abs(ratio - n) <= 0.06 + 1e-6 && n >= 1) return n
  return Math.max(0, Math.floor(ratio + 1e-9))
}

export interface ClosedPositionsTableProps {
  limit?: number
  analyses: DecisionAnalysis[]
  expandedDetailKey: string | null
  onToggleDetail: (key: string) => void
}

export const ClosedPositionsTable: React.FC<ClosedPositionsTableProps> = ({
  limit = 50,
  analyses,
  expandedDetailKey,
  onToggleDetail,
}) => {
  const { closedPositions: cachedClosed, setClosedPositions: setCachedClosed, dashboardRefreshNonce } =
    useDashboardDataCache()
  const { data: wsData } = useWebSocket('')
  const [loading, setLoading] = useState(() => cachedClosed === null)
  const [sort, dispatchSort] = useReducer(closedSortReducer, CLOSED_SORT_INITIAL)

  const rows = cachedClosed?.positions ?? []

  const toggleSortColumn = useCallback((key: ClosedPositionSortKey) => {
    dispatchSort({ type: 'toggle', key })
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchHistory = async () => {
      try {
        const data = await apiClient.getClosedPositions(limit)
        if (!cancelled) setCachedClosed(data)
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch closed positions:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchHistory()
    const interval = setInterval(() => void fetchHistory(), DASHBOARD_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [limit])

  useEffect(() => {
    if (dashboardRefreshNonce === 0) return
    let cancelled = false
    void (async () => {
      try {
        const data = await apiClient.getClosedPositions(limit)
        if (!cancelled) setCachedClosed(data)
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch closed positions:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dashboardRefreshNonce, limit, setCachedClosed])

  useEffect(() => {
    if (!wsData || wsData.type !== 'closed_positions_resolution') return
    const raw = wsData.data as { updates?: Array<{ id: string; kalshi_market_result?: string | null; kalshi_market_status?: string | null }> }
    const updates = raw?.updates
    if (!updates?.length) return
    setCachedClosed((prev) => {
      if (!prev?.positions?.length) return prev
      const byId = new Map(updates.map((u) => [u.id, u]))
      const nextPositions = prev.positions.map((p) => {
        const u = byId.get(p.id)
        if (!u) return p
        const r = typeof u.kalshi_market_result === 'string' ? u.kalshi_market_result.trim().toLowerCase() : ''
        const hasResult = r === 'yes' || r === 'no'
        return {
          ...p,
          kalshi_market_result: hasResult ? (r as 'yes' | 'no') : (p.kalshi_market_result ?? null),
          kalshi_market_status: u.kalshi_market_status ?? p.kalshi_market_status,
          kalshi_outcome_pending: !hasResult,
        }
      })
      return { ...prev, positions: nextPositions }
    })
  }, [wsData, setCachedClosed])

  const sortedRows = useMemo(() => {
    const safeDate = (iso?: string | null) => {
      const t = Date.parse(iso ?? '')
      return Number.isNaN(t) ? -Infinity : t
    }
    const safeNum = (n: unknown) => {
      const v = Number(n)
      return Number.isFinite(v) ? v : 0
    }
    const safeStr = (s: unknown) => String(s ?? '').toLowerCase()

    const dir = sort.dir === 'asc' ? 1 : -1
    const out = rows.map((p, idx) => ({ p, idx }))
    out.sort((a, b) => {
      const pa = a.p
      const pb = b.p
      let cmp = 0
      switch (sort.key) {
        case 'closed_at':
          cmp = safeDate(pa.closed_at) - safeDate(pb.closed_at)
          break
        case 'opened_at':
          cmp = safeDate(pa.opened_at) - safeDate(pb.opened_at)
          break
        case 'market':
          cmp = safeStr(pa.market_title || pa.market_id).localeCompare(safeStr(pb.market_title || pb.market_id))
          break
        case 'side':
          cmp = safeStr(pa.side).localeCompare(safeStr(pb.side))
          break
        case 'qty':
          cmp = displayClosedQuantity(pa) - displayClosedQuantity(pb)
          break
        case 'invested': {
          const inv = (p: ClosedPosition) =>
            positionCashInvestedUsd({
              entry_cost: p.entry_cost,
              entry_price: p.entry_price,
              quantity: displayClosedQuantity(p),
              fees_paid: p.fees_paid,
            })
          cmp = inv(pa) - inv(pb)
          break
        }
        case 'entry':
          cmp = safeNum(pa.entry_price) - safeNum(pb.entry_price)
          break
        case 'exit':
          cmp = safeNum(pa.exit_price) - safeNum(pb.exit_price)
          break
        case 'pnl':
          cmp = safeNum(pa.realized_pnl) - safeNum(pb.realized_pnl)
          break
      }
      if (cmp !== 0) return cmp * dir
      return a.idx - b.idx
    })
    return out.map((x) => x.p)
  }, [rows, sort.dir, sort.key])

  if (loading) return <div className="text-white text-sm py-4">Loading closed positions…</div>

  if (cachedClosed === null) {
    return (
      <div className="ui-surface-sm p-8 text-center">
        <p className="text-white text-sm">Could not load closed positions</p>
        <p className="text-white text-xs mt-1">Check the backend and refresh the page</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="ui-surface-sm p-8 text-center">
        <p className="text-white text-sm">No closed positions yet</p>
        <p className="text-white text-xs mt-1">Closed positions will appear here after exits</p>
      </div>
    )
  }

  return (
    <div className="ui-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px]">
          <thead className="border-b border-brand-muted/40 bg-black/30">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="market"
                  label="Market"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="side"
                  label="Side"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="qty"
                  label="Qty"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="invested"
                  label="Invested $"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="entry"
                  label="Entry"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="exit"
                  label="Exit"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="pnl"
                  label="Net realized P&L"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="opened_at"
                  label="Opened"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase text-white whitespace-nowrap">
                <ClosedSortHeader
                  columnKey="closed_at"
                  label="Closed"
                  align="right"
                  activeKey={sort.key}
                  onToggleColumn={toggleSortColumn}
                />
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-white whitespace-nowrap">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/20">
            {sortedRows.map((p) => {
              const pnl = Number(p.realized_pnl ?? 0)
              const isPos = pnl >= 0
              const qty = Math.max(0, Number(p.quantity ?? 0), displayClosedQuantity(p))
              const investedValue = positionCashInvestedUsd({
                entry_cost: p.entry_cost,
                entry_price: p.entry_price,
                quantity: qty,
                fees_paid: p.fees_paid,
              })
              const parUsd = Math.max(0, qty) * 1.0
              const vsParPct = parUsd > 1e-6 ? (pnl / parUsd) * 100 : null
              const pnlPct =
                investedValue > 1e-9 ? ((pnl / investedValue) * 100).toFixed(1) : '0.0'
              const pnlTitle =
                '(qty × exit) − invested $, where invested is open notional + buy and sell fees (Kalshi-style).'
              const pnlPctTitle =
                vsParPct != null && Number.isFinite(vsParPct)
                  ? `${pnlTitle} Return vs invested: ${pnlPct}%. vs $1/contract par: ${vsParPct.toFixed(1)}% (${qty} ct).`
                  : `${pnlTitle} Return vs invested: ${pnlPct}%.`
              const detailKey = `closed:${p.id}`
              const expanded = expandedDetailKey === detailKey
              const analysis = analysisForPositionRow(p, analyses, cachedClosed?.position_analyses)

              return (
                <Fragment key={p.id}>
                  <tr className="transition odd:bg-secondary even:bg-stripe hover:brightness-[1.05]">
                    <td className="px-5 py-4 w-[420px]">
                      <p
                        className="text-[13px] leading-snug font-semibold text-white line-clamp-2"
                        title={p.market_title || p.market_id}
                      >
                        {p.market_title || p.market_id}
                      </p>
                      <p className="text-[11px] text-white truncate" title={p.market_id}>
                        {p.market_id}
                      </p>
                    </td>
                    <td className="px-5 py-4 align-top">
                      <div className="flex flex-col gap-1 items-start">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                            p.side === 'YES' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {p.side}
                        </span>
                        {(() => {
                          const oc = kalshiOutcomeLabel(p.kalshi_market_result)
                          const sideU = (p.side || '').trim().toUpperCase()
                          const correct =
                            oc && sideU
                              ? (sideU === 'YES' && oc === 'YES') || (sideU === 'NO' && oc === 'NO')
                              : null
                          if (oc) {
                            const ocClass = oc === 'YES' ? 'text-green-400/95' : 'text-red-400/95'
                            return (
                              <span className="inline-flex flex-col gap-0.5">
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide leading-tight whitespace-nowrap ${ocClass}`}
                                  title="Official Kalshi contract outcome for this market (when recorded on this close row)."
                                >
                                  Result {oc}
                                  {correct === true && (
                                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-label="Bet correct" />
                                  )}
                                  {correct === false && (
                                    <X className="w-3.5 h-3.5 text-red-400 shrink-0" aria-label="Bet incorrect" />
                                  )}
                                </span>
                              </span>
                            )
                          }
                          if (p.kalshi_outcome_pending) {
                            return (
                              <span
                                className="block text-[10px] text-white/50 leading-tight"
                                title="Kalshi has not stored yes/no on this row yet; it usually fills after GET /markets backfill or settlement metadata."
                              >
                                Outcome pending
                              </span>
                            )
                          }
                          return null
                        })()}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-white">{formatContracts(qty)}</td>
                    <td className="px-5 py-4 text-right text-sm text-white">${investedValue.toFixed(2)}</td>
                    <td className="px-5 py-4 text-right text-sm text-white">{formatContractPriceCents(p.entry_price)}</td>
                    <td className="px-5 py-4 text-right text-sm text-white">{formatContractPriceCents(p.exit_price)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className={`text-sm font-semibold ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                        <div className="flex items-center justify-end gap-1">
                          {isPos ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          ${Math.abs(pnl).toFixed(2)}
                        </div>
                        <div className="text-xs font-normal opacity-75" title={pnlPctTitle}>
                          {isPos ? '+' : ''}
                          {pnlPct}%
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-xs text-white">{formatUtcIsoLocal(p.opened_at)}</td>
                    <td className="px-5 py-4 text-right text-xs">
                      {(p.exit_reason || '').toLowerCase() === 'stop_loss' ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-red-400 font-semibold leading-tight">Stop loss</span>
                          <span className="text-white">{formatUtcIsoLocal(p.closed_at)}</span>
                        </div>
                      ) : (
                        <span className="text-white">{formatUtcIsoLocal(p.closed_at)}</span>
                      )}
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
                  </tr>
                  {expanded && (
                    <tr className="bg-black/35">
                      <td colSpan={10} className="border-t border-brand-muted/30 px-5 py-4 align-top">
                        {analysis ? (
                          <AnalysisDetailBody a={analysis} />
                        ) : (
                          <p className="text-sm text-white">
                            No matching saved decision log for this ticker (older bots logged raw Kalshi ids that did not match
                            position rows; new scans log normalized ids). If you expected AI analysis here, try Reconcile or a
                            manual analyze on this contract — otherwise history may never have been persisted for this key.
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
  )
}
