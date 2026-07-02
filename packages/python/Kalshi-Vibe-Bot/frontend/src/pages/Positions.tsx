import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Activity } from 'lucide-react'
import { AnalysisDetailBody } from '../components/AnalysisDetailPanel'
import { apiClient, BotStateInfo, DecisionAnalysis, AnalysesStats } from '../api'
import { useWebSocket } from '../hooks/useWebSocket'

export const AIAnalysis: React.FC = () => {
  const [botInfo, setBotInfo] = useState<BotStateInfo | null>(null)
  const [analyses, setAnalyses] = useState<DecisionAnalysis[]>([])
  const [analysisStats, setAnalysisStats] = useState<AnalysesStats | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [tradingMode, setTradingMode] = useState<'paper' | 'live'>('paper')
  const tradingModeRef = useRef(tradingMode)
  tradingModeRef.current = tradingMode

  const { data: wsData } = useWebSocket('ws://localhost:8000/ws')

  const dedupeAnalyses = useCallback((items: DecisionAnalysis[]) => {
    // Keep most recent entry per market_id (initial DB load can include duplicates)
    const m = new Map<string, DecisionAnalysis>()
    for (const a of items) {
      const key = a.market_id
      const prev = m.get(key)
      if (!prev) {
        m.set(key, a)
        continue
      }
      const prevT = Date.parse(prev.timestamp)
      const curT = Date.parse(a.timestamp)
      if (!Number.isNaN(curT) && (Number.isNaN(prevT) || curT >= prevT)) {
        m.set(key, a)
      }
    }
    return Array.from(m.values()).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
  }, [])

  const loadBotState = useCallback(async () => {
    try {
      setBotInfo(await apiClient.getBotState())
    } catch {
      /* backend may not be ready */
    }
  }, [])

  const loadAnalyses = useCallback(async () => {
    try {
      const [rows, stats] = await Promise.all([
        apiClient.getAnalyses(50),
        apiClient.getAnalysesStats(168),
      ])
      setAnalyses(dedupeAnalyses(rows).slice(0, 30))
      setAnalysisStats(stats)
    } catch {
      /* ignore */
    }
  }, [dedupeAnalyses])

  const syncTradingMode = useCallback(async () => {
    try {
      const h = await apiClient.getHealth()
      setTradingMode(h.mode === 'live' ? 'live' : 'paper')
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    syncTradingMode()
    loadBotState()
    loadAnalyses()
  }, [syncTradingMode, loadBotState, loadAnalyses])

  useEffect(() => {
    if (!wsData) return
    if (wsData.type === 'bot_state') {
      const d = wsData.data as { state?: string } | undefined
      if (d?.state) {
        setBotInfo((prev) => ({
          state: d.state as 'play' | 'pause' | 'stop',
          updated_at: prev?.updated_at ?? '',
        }))
      }
    }
    if (wsData.type === 'analysis') {
      const incoming = wsData.data as DecisionAnalysis
      const tm = incoming.trade_mode
      if (tm !== undefined && tm !== tradingModeRef.current) return
      if (tm === undefined) {
        loadAnalyses()
        return
      }
      setAnalyses((prev) => {
        const deduped = prev.filter((x) => x.market_id !== incoming.market_id)
        return dedupeAnalyses([incoming, ...deduped]).slice(0, 30)
      })
      apiClient.getAnalysesStats(168).then(setAnalysisStats).catch(() => {})
    }
    if (wsData.type === 'mode_changed') {
      const md = wsData.data as { mode?: string } | undefined
      const m = md?.mode === 'live' ? 'live' : 'paper'
      setTradingMode(m)
      setRefreshKey((k) => k + 1)
      loadAnalyses()
    }
  }, [wsData, dedupeAnalyses, loadAnalyses])

  const currentState = botInfo?.state ?? 'stop'

  const statsHint = analysisStats
    ? (() => {
        const days = Math.round(analysisStats.since_hours / 24)
        const period =
          analysisStats.since_hours >= 24
            ? `${days} day${days === 1 ? '' : 's'}`
            : `${analysisStats.since_hours} hour${analysisStats.since_hours === 1 ? '' : 's'}`
        const escalated = analysisStats.escalated_to_ai ?? analysisStats.escalated_to_xai
        return `${escalated.toLocaleString()} sent to AI · ${analysisStats.total_analyses.toLocaleString()} analyses (last ${period})`
      })()
    : null

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">AI Analysis</h1>
        <p className="text-white mt-1 text-sm">Real-time AI trading activity</p>
      </div>

      <section key={`analysis-${refreshKey}`}>
        <div>
          <div className="flex items-center justify-between mb-3 gap-4">
            <h2 className="text-base font-semibold text-white">
              Recent AI Analysis
              <span className="ml-2 text-xs font-normal text-white normal-case">
                ({tradingMode})
              </span>
            </h2>
            <span className="text-xs text-white text-right shrink-0 max-w-[70%]">
              {statsHint ?? 'Loading stats…'}
            </span>
          </div>
          <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
            {analyses.length === 0 ? (
              <div className="ui-surface flex flex-col items-center justify-center gap-3 py-14 text-white">
                <Activity className="w-8 h-8 opacity-40" />
                <p className="text-sm">
                  {currentState === 'play'
                    ? 'Waiting for first market scan…'
                    : 'Press Play to start the trading bot.'}
                </p>
              </div>
            ) : (
              analyses.map((a) => (
                <AnalysisDetailBody key={`${a.market_id}-${a.timestamp}`} a={a} />
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default AIAnalysis
