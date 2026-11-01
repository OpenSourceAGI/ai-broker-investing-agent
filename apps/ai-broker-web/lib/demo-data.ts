// Demo data for the dashboard

export interface Agent {
  name: string
  type: 'analyst' | 'researcher' | 'trader' | 'risk' | 'pm'
  queueLength: number
  status?: string
  lastActivity?: string
}

export interface Strategy {
  id: string
  name: string
  provider?: 'builtin' | 'tradingview' | 'third-party'
  /** False when /api/backtest-technical cannot run it; undefined means runnable. */
  backtestable?: boolean
  provenance?: { upstream: string; license: string; fidelity: string; venue: string; backtest: string }
  description?: string
  source?: string
  author?: string
  created?: string
  likes?: number
  last30DaysPnL?: number
  script_type?: string
  status?: string
  performance?: number
}

export const demoAgents: Agent[] = []

export const demoStrategies: Strategy[] = []

export const demoRiskMetrics = {}
export const demoPositions: any[] = []
export const demoTrades: any[] = []
