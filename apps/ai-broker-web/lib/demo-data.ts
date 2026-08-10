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
  description?: string
  status?: string
  performance?: number
}

export const demoAgents: Agent[] = []

export const demoStrategies: Strategy[] = []

export const demoRiskMetrics = {}
export const demoPositions: any[] = []
export const demoTrades: any[] = []
