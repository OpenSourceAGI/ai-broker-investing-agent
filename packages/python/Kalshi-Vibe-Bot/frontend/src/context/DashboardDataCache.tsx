import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type {
  ClosedPositionsResponse,
  DecisionAnalysis,
  Portfolio,
  Position,
} from '../api'

type DashboardDataCacheValue = {
  portfolio: Portfolio | null
  setPortfolio: React.Dispatch<React.SetStateAction<Portfolio | null>>
  /** `null` = never fetched yet; `[]` = fetched, no open rows */
  positions: Position[] | null
  setPositions: React.Dispatch<React.SetStateAction<Position[] | null>>
  /** Latest ``DecisionLog`` per open ticker from dashboard bundle (keys upper or as returned). */
  positionAnalysesByMarketId: Record<string, DecisionAnalysis>
  setPositionAnalysesByMarketId: React.Dispatch<
    React.SetStateAction<Record<string, DecisionAnalysis>>
  >
  /** `null` = never fetched yet */
  closedPositions: ClosedPositionsResponse | null
  setClosedPositions: React.Dispatch<React.SetStateAction<ClosedPositionsResponse | null>>
  /**
   * Increments when the server broadcasts ``dashboard_refresh`` so widgets refetch without tightening poll intervals.
   * Hybrid pattern: slower baseline polling + push-triggered invalidation (common for trading dashboards).
   */
  dashboardRefreshNonce: number
  bumpDashboardRefresh: () => void
}

const DashboardDataCacheContext = createContext<DashboardDataCacheValue | null>(null)

export function DashboardDataCacheProvider({ children }: { children: React.ReactNode }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [positions, setPositions] = useState<Position[] | null>(null)
  const [positionAnalysesByMarketId, setPositionAnalysesByMarketId] = useState<
    Record<string, DecisionAnalysis>
  >({})
  const [closedPositions, setClosedPositions] = useState<ClosedPositionsResponse | null>(null)
  const [dashboardRefreshNonce, setDashboardRefreshNonce] = useState(0)

  const bumpDashboardRefresh = useCallback(() => {
    setDashboardRefreshNonce((n) => n + 1)
  }, [])

  const value = useMemo(
    () => ({
      portfolio,
      setPortfolio,
      positions,
      setPositions,
      positionAnalysesByMarketId,
      setPositionAnalysesByMarketId,
      closedPositions,
      setClosedPositions,
      dashboardRefreshNonce,
      bumpDashboardRefresh,
    }),
    [
      portfolio,
      positions,
      positionAnalysesByMarketId,
      closedPositions,
      dashboardRefreshNonce,
      bumpDashboardRefresh,
    ],
  )

  return <DashboardDataCacheContext.Provider value={value}>{children}</DashboardDataCacheContext.Provider>
}

export function useDashboardDataCache(): DashboardDataCacheValue {
  const ctx = useContext(DashboardDataCacheContext)
  if (!ctx) {
    throw new Error('useDashboardDataCache must be used within DashboardDataCacheProvider')
  }
  return ctx
}
