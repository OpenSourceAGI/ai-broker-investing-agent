// Stock agents API client
// TODO: Implement stock agents API integration

export interface NewsResearcherAnalysisResponse {
  success: boolean
  symbols: string[]
  date: string
  timestamp: string
  result: {
    portfolio_manager_results?: {
      decision: string
      confidence: number
      reasoning: string
    }
    technical_analysis_results?: {
      summary?: string
    }
    news_intelligence_results?: {
      summary?: string
    }
    data_collection_results?: {
      summary?: string
    }
  }
}

export interface DebateAnalystAnalysisResponse {
  success: boolean
  symbol: string
  date: string
  timestamp: string
  decision: {
    action: string
    confidence: number
    reasoning: string
    position_size: number
    debate_summary?: {
      bull_arguments: string[]
      bear_arguments: string[]
      risk_assessment: string
    }
  }
}

export interface BacktestResponse {
  success: boolean
  results: any[]
}

export const stockAgentsApi = {
  analyzeWithNewsResearcher: async (params: { symbols: string[] }): Promise<NewsResearcherAnalysisResponse> => {
    throw new Error('Not implemented')
  },
  analyzeWithDebateAnalyst: async (params: { symbol: string }): Promise<DebateAnalystAnalysisResponse> => {
    const response = await fetch('/api/groq-debate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: params.symbol,
        date: new Date().toISOString().split('T')[0],
        max_debate_rounds: 2,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Debate analysis failed: ${error}`)
    }

    const data = await response.json()

    // Transform the groq-debate response to match DebateAnalystAnalysisResponse
    return {
      success: data.success,
      symbol: data.symbol,
      date: data.date,
      timestamp: new Date().toISOString(),
      decision: {
        action: extractAction(data.analysis.final_decision),
        confidence: parseConfidence(data.analysis.confidence_level),
        reasoning: data.analysis.reasoning,
        position_size: calculatePositionSize(data.analysis.confidence_level),
        debate_summary: {
          bull_arguments: data.analysis.bull_arguments || [],
          bear_arguments: data.analysis.bear_arguments || [],
          risk_assessment: data.analysis.risk_assessment || '',
        },
      },
    }
  },
  getAgentLogs: async (): Promise<any[]> => {
    return []
  },
}

// Helper function to extract action (BUY/SELL/HOLD) from decision text
function extractAction(decision: string): string {
  const upperDecision = decision.toUpperCase()
  if (upperDecision.includes('BUY') || upperDecision.includes('LONG')) {
    return 'BUY'
  } else if (upperDecision.includes('SELL') || upperDecision.includes('SHORT')) {
    return 'SELL'
  } else {
    return 'HOLD'
  }
}

// Helper function to parse confidence level to a number (0-1)
function parseConfidence(confidenceLevel: string): number {
  const lower = confidenceLevel.toLowerCase()
  if (lower.includes('high') || lower.includes('strong')) {
    return 0.8
  } else if (lower.includes('medium') || lower.includes('moderate')) {
    return 0.6
  } else if (lower.includes('low') || lower.includes('weak')) {
    return 0.4
  }
  // Try to parse as percentage or decimal
  const match = confidenceLevel.match(/(\d+\.?\d*)/)
  if (match) {
    const num = parseFloat(match[1])
    return num > 1 ? num / 100 : num
  }
  return 0.5 // default
}

// Helper function to calculate position size based on confidence
function calculatePositionSize(confidenceLevel: string): number {
  const confidence = parseConfidence(confidenceLevel)
  // Scale position size from 0.05 to 0.25 based on confidence
  return Math.max(0.05, Math.min(0.25, confidence * 0.3))
}

// Alias for backward compatibility
export const stockAgentsAPI = stockAgentsApi
