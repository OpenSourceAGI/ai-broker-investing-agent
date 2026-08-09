import { NextRequest, NextResponse } from 'next/server'
import { TradingAgentsGraph } from '@/packages/investing/src/trading-agents/graph/trading-graph'
import { AnalystType, TradingConfig } from '@/packages/investing/src/trading-agents/types'

interface DebateAnalysisRequest {
  ticker: string
  quickMode?: boolean
  quiet?: boolean
  analysts?: AnalystType[]
}

interface DebateAnalysisResponse {
  success: boolean
  ticker: string
  result?: {
    company: string
    price?: number
    decision: 'BUY' | 'SELL' | 'HOLD'
    confidence: number
    marketReport: string
    newsReport: string
    sentimentReport: string
    fundamentalsReport: string
    bullArguments: string
    bearArguments: string
    judgeDecision: string
    traderDecision: string
    timestamp: string
  }
  error?: string
  output?: string
}

/**
 * POST /api/debate-agents
 *
 * Run multi-agent debate analysis on a stock ticker using TradingAgents with Groq API.
 *
 * @example
 * POST /api/debate-agents
 * {
 *   "ticker": "AAPL",
 *   "quickMode": false,
 *   "quiet": true,
 *   "analysts": ["market", "news"]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body: DebateAnalysisRequest = await request.json()
    const {
      ticker,
      quickMode = false,
      quiet = true,
      analysts = ['market', 'news']
    } = body

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: ticker' },
        { status: 400 }
      )
    }

    // Validate ticker format
    if (!/^[A-Z0-9._-]+$/.test(ticker.toUpperCase())) {
      return NextResponse.json(
        { success: false, error: 'Invalid ticker format' },
        { status: 400 }
      )
    }

    console.log(`Running trading agents debate analysis for ${ticker} with Groq API...`)

    // Configure TradingAgents to use Groq
    const config: TradingConfig = {
      llmProvider: 'groq',
      deepThinkLLM: quickMode ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
      quickThinkLLM: 'llama-3.1-8b-instant',
      temperature: 0.3,
      apiKeys: {
        groq: process.env.GROQ_API_KEY || ''
      }
    }

    // Validate GROQ_API_KEY
    if (!config.apiKeys?.groq) {
      return NextResponse.json(
        { success: false, error: 'GROQ_API_KEY not configured' },
        { status: 500 }
      )
    }

    // Initialize TradingAgentsGraph
    const graph = new TradingAgentsGraph(
      analysts as AnalystType[],
      !quiet, // debug mode
      config
    )

    // Run the analysis
    const tradeDate = new Date().toISOString().split('T')[0]
    const { state, signal } = await graph.propagate(ticker.toUpperCase(), tradeDate)

    // Format the response
    const response: DebateAnalysisResponse = {
      success: true,
      ticker: ticker.toUpperCase(),
      result: {
        company: state.companyOfInterest,
        decision: signal.action,
        confidence: signal.confidence,
        marketReport: state.marketReport || 'No market analysis performed',
        newsReport: state.newsReport || 'No news analysis performed',
        sentimentReport: state.sentimentReport || 'No sentiment analysis performed',
        fundamentalsReport: state.fundamentalsReport || 'No fundamentals analysis performed',
        bullArguments: state.investmentDebateState.bullHistory,
        bearArguments: state.investmentDebateState.bearHistory,
        judgeDecision: state.investmentDebateState.judgeDecision,
        traderDecision: state.traderInvestmentPlan || state.finalTradeDecision,
        timestamp: new Date().toISOString()
      }
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Trading agents debate analysis error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Analysis failed',
        details: error.toString()
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/debate-agents?ticker=AAPL
 *
 * Quick analysis endpoint - uses quick mode by default
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const ticker = searchParams.get('ticker')

  if (!ticker) {
    return NextResponse.json(
      { success: false, error: 'Missing required parameter: ticker' },
      { status: 400 }
    )
  }

  // Convert GET to POST with quick mode enabled
  return POST(
    new NextRequest(request.url, {
      method: 'POST',
      body: JSON.stringify({
        ticker,
        quickMode: true,
        quiet: true
      })
    })
  )
}
