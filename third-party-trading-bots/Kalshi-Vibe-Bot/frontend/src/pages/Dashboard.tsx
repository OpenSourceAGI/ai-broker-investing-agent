import React, { useCallback, useEffect, useState } from 'react'
import { PortfolioOverview } from '../components/PortfolioOverview'
import { PositionsTable } from '../components/PositionsTable'
import { apiClient, DecisionAnalysis } from '../api'
import { useDashboardDataCache } from '../context/DashboardDataCache'
import { DASHBOARD_POLL_INTERVAL_MS } from '../dashboardPolling'
import { useDocumentVisible } from '../hooks/useDocumentVisible'
import { useWebSocket } from '../hooks/useWebSocket'

// ── Main component ──────────────────────────────────────────────────────────

export const Dashboard: React.FC = () => {
  const [tradingMode, setTradingMode] = useState<'paper' | 'live'>('paper')
  const {
    bumpDashboardRefresh,
    dashboardRefreshNonce,
    setPortfolio,
    setPositions,
    setPositionAnalysesByMarketId,
  } = useDashboardDataCache()
  const docVisible = useDocumentVisible()
  const pollMs = docVisible ? DASHBOARD_POLL_INTERVAL_MS : DASHBOARD_POLL_INTERVAL_MS * 3

  const loadDashboardBundle = useCallback(async () => {
    try {
      const b = await apiClient.getDashboardBundle()
      setPortfolio(b.portfolio)
      setPositions(b.positions)
      setPositionAnalysesByMarketId(b.position_analyses ?? {})
    } catch (e) {
      console.error('Dashboard bundle:', e)
    }
  }, [setPortfolio, setPositions, setPositionAnalysesByMarketId])
  const { data: wsData } = useWebSocket('')
  const [analyses, setAnalyses] = useState<DecisionAnalysis[]>([])
  /** Only one expanded detail row across open + closed (`open:id` / `closed:id`). */
  const [expandedDetailKey, setExpandedDetailKey] = useState<string | null>(null)

  useEffect(() => {
    const syncTradingMode = async () => {
      try {
        const h = await apiClient.getHealth()
        setTradingMode(h.mode === 'live' ? 'live' : 'paper')
      } catch {
        /* ignore */
      }
    }
    syncTradingMode()
  }, [])

  useEffect(() => {
    if (!wsData) return
    if (wsData.type === 'mode_changed') {
      const d = wsData.data as { mode?: string } | undefined
      setTradingMode(d?.mode === 'live' ? 'live' : 'paper')
      void loadDashboardBundle()
    }
    if (wsData.type === 'dashboard_refresh') {
      bumpDashboardRefresh()
    }
  }, [wsData, bumpDashboardRefresh, loadDashboardBundle])

  useEffect(() => {
    void loadDashboardBundle()
    const id = setInterval(() => void loadDashboardBundle(), pollMs)
    return () => clearInterval(id)
  }, [loadDashboardBundle, pollMs])

  useEffect(() => {
    if (dashboardRefreshNonce === 0) return
    void loadDashboardBundle()
  }, [dashboardRefreshNonce, loadDashboardBundle])

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

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-white mt-1 text-sm">Portfolio and positions</p>
      </div>

      {/* ── Portfolio overview ── */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3">Portfolio</h2>
        <PortfolioOverview tradingMode={tradingMode} />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-white">Open positions</h2>
            <p className="text-xs text-white/75 mt-0.5 max-w-xl leading-snug">
              Subtitles show trade vs settlement state. Invested $ includes contract cost plus buy-side fees. Marks use
              bids when liquid; SELL when exit is available (live: IOC against the book).
            </p>
          </div>
        </div>
        <PositionsTable
          tradingMode={tradingMode}
          analyses={analyses}
          expandedDetailKey={expandedDetailKey}
          onToggleDetail={toggleDetail}
        />
      </section>

    </div>
  )
}

export default Dashboard
