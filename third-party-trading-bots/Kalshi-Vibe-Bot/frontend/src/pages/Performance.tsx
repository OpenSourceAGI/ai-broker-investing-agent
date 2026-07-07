import React, { useEffect, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { apiClient, DecisionAnalysis, PerformanceStats } from '../api'
import { ClosedPositionsTable } from '../components/ClosedPositionsTable'
import { useDashboardDataCache } from '../context/DashboardDataCache'
import { useWebSocket } from '../hooks/useWebSocket'
import { TrendingUp, Activity, DollarSign } from 'lucide-react'

const chartTick = { fill: '#ffffff', fontSize: 11 }

const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#1c2e4a',
    border: '1px solid rgba(127, 140, 141, 0.45)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#ffffff',
  },
  labelStyle: { color: '#ffffff' },
  itemStyle: { color: '#ffffff' },
}

export const Performance: React.FC = () => {
  const [stats, setStats] = useState<PerformanceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const { bumpDashboardRefresh } = useDashboardDataCache()
  const { data: wsData } = useWebSocket('')
  const [analyses, setAnalyses] = useState<DecisionAnalysis[]>([])
  const [expandedDetailKey, setExpandedDetailKey] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const s = await apiClient.getPerformance()
        setStats(s)
      } catch (e) {
        console.error('Performance load error:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!wsData) return
    if (wsData.type === 'dashboard_refresh') {
      bumpDashboardRefresh()
    }
  }, [wsData, bumpDashboardRefresh])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiClient.getAnalyses(120)
        setAnalyses(data)
      } catch {
        /* ignore */
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!expandedDetailKey) return
    const load = async () => {
      try {
        const data = await apiClient.getAnalyses(120)
        setAnalyses(data)
      } catch {
        /* ignore */
      }
    }
    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [expandedDetailKey])

  const toggleDetail = (key: string) => {
    setExpandedDetailKey((k) => (k === key ? null : key))
  }

  /** Win rate / bar chart use closed positions, not sell ledger rows. */
  const closedPositions =
    stats != null && stats.closed_positions_count != null
      ? stats.closed_positions_count
      : stats?.sell_count ?? 0

  const closedWins = stats?.closed_wins_count ?? 0
  const closedLosses = stats?.closed_losses_count ?? 0
  const closedBreakeven = stats?.closed_breakeven_count ?? 0

  const tradeDistribution =
    stats == null
      ? []
      : [
          {
            name: 'Winning',
            value:
              stats.closed_wins_count ??
              Math.round(closedPositions * (stats.win_rate / 100)),
          },
          {
            name: 'Losing',
            value:
              stats.closed_losses_count ??
              Math.max(
                0,
                closedPositions -
                  (stats.closed_wins_count ??
                    Math.round(closedPositions * (stats.win_rate / 100))),
              ),
          },
          ...((stats.closed_breakeven_count ?? 0) > 0
            ? [{ name: 'Breakeven', value: stats.closed_breakeven_count ?? 0 }]
            : []),
        ].filter((d) => d.value > 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-white">Performance</h1>
        <p className="text-white mt-1">Analytics and trading metrics</p>
      </div>

      {/* Key metrics */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ui-surface-sm animate-pulse p-5">
              <div className="mb-3 h-3 w-2/3 rounded bg-brand-muted/25" />
              <div className="h-8 w-1/2 rounded bg-brand-muted/25" />
            </div>
          ))}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            label="Closed positions"
            value={String(closedPositions)}
            detail={
              closedPositions === 0
                ? 'No closed positions yet'
                : `${closedWins} win${closedWins === 1 ? '' : 's'} · ${closedLosses} loss${closedLosses === 1 ? '' : 'es'}${
                    closedBreakeven > 0 ? ` · ${closedBreakeven} breakeven` : ''
                  }`
            }
            icon={<Activity className="w-5 h-5 text-blue-400" />}
          />
          <MetricCard
            label="Win rate (closed)"
            value={
              closedPositions === 0
                ? '—'
                : `${stats.win_rate.toFixed(1)}%`
            }
            detail={
              closedPositions === 0
                ? 'No closed positions yet'
                : `${closedPositions} closed position${closedPositions === 1 ? '' : 's'}`
            }
            color={
              closedPositions === 0
                ? 'text-white'
                : stats.win_rate >= 50
                  ? 'text-green-400'
                  : 'text-red-400'
            }
            icon={<TrendingUp className="w-5 h-5 text-green-400" />}
          />
          <RealizedPnlBreakdownCard
            realized={stats.total_realized_pnl}
            gained={stats.total_gained ?? 0}
            lost={stats.total_lost ?? 0}
          />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="ui-surface-sm p-5">
          <h2 className="text-base font-semibold text-white mb-1">P&amp;L over time</h2>
          <p className="text-xs text-white mb-4">Cumulative realized P&amp;L by close date (closed positions).</p>
          {stats && stats.daily_pnl.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={stats.daily_pnl}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.12)" />
                <XAxis dataKey="date" stroke="rgba(255,255,255,0.35)" tick={{ ...chartTick }} />
                <YAxis
                  stroke="rgba(255,255,255,0.35)"
                  tick={{ ...chartTick }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number) => [`$${Number(v).toFixed(2)}`, 'Cumulative realized']}
                />
                <Line
                  type="monotone" dataKey="pnl" stroke="#3b82f6" strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-white text-sm">
              No closed-position history with dates yet — cumulative realized P&amp;L will plot here after closes.
            </div>
          )}
        </div>

        <div className="ui-surface-sm p-5">
          <h2 className="text-base font-semibold text-white mb-1">Closed trade outcomes</h2>
          <p className="text-xs text-white mb-4">
            Win vs loss counts closed positions (Kalshi-realized sum per ticker in live). Sell ledger rows can differ if exits partial-fill multiple times.
          </p>
          {tradeDistribution.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={tradeDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.12)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.35)" tick={{ fill: '#ffffff', fontSize: 12 }} />
                <YAxis stroke="rgba(255,255,255,0.35)" tick={{ ...chartTick }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar
                  dataKey="value"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  label={{ position: 'top', fill: '#ffffff', fontSize: 11 }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-60 flex items-center justify-center text-white text-sm">
              No closed trades yet
            </div>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-white">Closed positions</h2>
          <p className="text-xs text-white mt-0.5">
            Kalshi-style: Entry / Exit are avg $/contract from fills. Invested $ = open notional + buy fees + sell
            fees. Net realized = (qty × exit) − invested. % vs invested; hover for vs $1/contract par.
          </p>
        </div>
        <ClosedPositionsTable
          limit={50}
          analyses={analyses}
          expandedDetailKey={expandedDetailKey}
          onToggleDetail={toggleDetail}
        />
      </section>
    </div>
  )
}

const MetricCard: React.FC<{
  label: string
  value: string
  detail?: string
  color?: string
  icon: React.ReactNode
}> = ({ label, value, detail, color = 'text-white', icon }) => (
  <div className="ui-surface-sm p-5">
    <div className="flex items-center justify-between mb-2">
      <p className="text-white text-xs font-medium uppercase tracking-wide">{label}</p>
      {icon}
    </div>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
    {detail ? <p className="text-xs text-white mt-1 leading-snug">{detail}</p> : null}
  </div>
)

const RealizedPnlBreakdownCard: React.FC<{
  realized: number
  gained: number
  lost: number
}> = ({ realized, gained, lost }) => {
  const realizedColor = realized >= 0 ? 'text-green-400' : 'text-red-400'
  const fmt = (v: number) => {
    const n = Number(v) || 0
    const sign = n >= 0 ? '+' : ''
    return `${sign}$${n.toFixed(2)}`
  }

  return (
    <div className="ui-surface-sm p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-white text-xs font-medium uppercase tracking-wide">Realized P&amp;L</p>
        <DollarSign className="w-5 h-5 text-yellow-400" />
      </div>

      <div className="grid grid-cols-3 gap-3 items-end">
        <div className="min-w-0">
          <p className="text-white/80 text-[10px] font-medium uppercase tracking-wide">Gained</p>
          <p className="text-green-400 text-sm font-semibold tabular-nums truncate">{fmt(Math.max(0, gained))}</p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-white/80 text-[10px] font-medium uppercase tracking-wide">Lost</p>
          <p className="text-red-400 text-sm font-semibold tabular-nums truncate">{fmt(Math.min(0, lost))}</p>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-white/80 text-[10px] font-medium uppercase tracking-wide">Net</p>
          <p className={`text-2xl font-bold tabular-nums truncate ${realizedColor}`}>
            {fmt(realized)}
          </p>
        </div>
      </div>
    </div>
  )
}

export default Performance
