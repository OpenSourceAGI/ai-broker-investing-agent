import { NextRequest, NextResponse } from 'next/server'
import { TradingAgentsGraph } from '@/packages/investing/src/trading-agents/graph/trading-graph'
import type { TradingConfig } from '@/packages/investing/src/trading-agents/types'
import { resolveDebateAnalystUrl } from '@/lib/debate-analyst-url'

interface GroqDebateRequest {
  symbol: string
  date?: string
  max_debate_rounds?: number
}

interface GroqDebateResponse {
  success: boolean
  symbol: string
  date: string
  analysis: {
    bull_arguments: string[]
    bear_arguments: string[]
    risk_assessment: string
    final_decision: string
    confidence_level: string
    reasoning: string
  }
  debate_history?: any[]
  error?: string
}

/**
 * Groq-powered multi-agent debate analysis for stocks
 *
 * This endpoint uses LangChain and the debate-analyst agent with Groq LLMs
 * for fast, cost-effective stock analysis through multi-agent debates.
 *
 * The debate system includes:
 * - Bull researcher presenting positive case
 * - Bear researcher presenting negative case
 * - Research manager judging the debate
 * - Risk management consensus (conservative, neutral, aggressive)
 * - Final trader decision
 */
export async function POST(request: NextRequest) {
  try {
    const body: GroqDebateRequest = await request.json()
    const { symbol, date, max_debate_rounds = 2 } = body

    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: symbol' },
        { status: 400 }
      )
    }

    const ticker = symbol.trim().toUpperCase()
    if (!/^[A-Z0-9._-]{1,15}$/.test(ticker)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ticker format' },
        { status: 400 }
      )
    }

    const tradeDate = date || new Date().toISOString().split('T')[0]

    // An external debate-analyst service is optional. Without one (or with a
    // localhost / bare-IP URL, which Workers reject with "error code: 1003"),
    // run the debate in-process with packages/investing.
    const analyzeUrl = resolveDebateAnalystUrl(process.env)
    const result = analyzeUrl
      ? await callExternalAnalyst(analyzeUrl, ticker, tradeDate, max_debate_rounds)
      : await runInProcessDebate(ticker, tradeDate)

    if (result instanceof NextResponse) return result

    // Transform the response to a more user-friendly format
    const analysis: GroqDebateResponse = {
      success: true,
      symbol: result.symbol || ticker,
      date: result.date || tradeDate,
      analysis: {
        bull_arguments: extractBullArguments(result),
        bear_arguments: extractBearArguments(result),
        risk_assessment: extractRiskAssessment(result),
        final_decision: extractFinalDecision(result),
        confidence_level: extractConfidence(result),
        reasoning: extractReasoning(result),
      },
      debate_history: result.debate_history || [],
    }

    return NextResponse.json(analysis)

  } catch (error: any) {
    console.error('Groq debate analysis error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to perform Groq debate analysis',
        details: error.toString()
      },
      { status: 500 }
    )
  }
}

async function callExternalAnalyst(
  analyzeUrl: string,
  symbol: string,
  date: string,
  maxDebateRounds: number
): Promise<any> {
  const response = await fetch(analyzeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, date, max_debate_rounds: maxDebateRounds }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Debate analyst error:', errorText)
    return NextResponse.json(
      {
        success: false,
        error: `Debate analyst service error: ${response.status} ${response.statusText}`
      },
      { status: 502 }
    )
  }

  return response.json()
}

/**
 * Runs the bull/bear debate with the in-repo TradingAgentsGraph on Groq and
 * maps its state onto the field names the external service used, so the
 * extract* helpers below work for both paths.
 */
async function runInProcessDebate(symbol: string, date: string): Promise<any> {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    return NextResponse.json(
      { success: false, error: 'GROQ_API_KEY not configured' },
      { status: 503 }
    )
  }

  const config: TradingConfig = {
    llmProvider: 'groq',
    deepThinkLLM: process.env.NEXT_PUBLIC_GROQ_DEEP_THINK_MODEL || 'llama-3.3-70b-versatile',
    quickThinkLLM: process.env.NEXT_PUBLIC_GROQ_QUICK_THINK_MODEL || 'llama-3.1-8b-instant',
    temperature: 0.3,
    apiKeys: { groq: groqKey },
  }

  const graph = new TradingAgentsGraph(['market', 'news'], false, config)
  const { state, signal } = await graph.propagate(symbol, date)

  return {
    symbol,
    date,
    bull_case: state.investmentDebateState?.bullHistory || '',
    bear_case: state.investmentDebateState?.bearHistory || '',
    risk_assessment: state.riskDebateState?.judgeDecision || '',
    final_decision: signal.action,
    confidence: String(signal.confidence),
    reasoning: signal.reasoning || state.investmentDebateState?.judgeDecision || '',
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    service: 'Groq Debate Analysis API',
    description: 'Multi-agent stock debate powered by Groq and LangChain',
    version: '1.0.0',
    features: [
      'Bull vs Bear debate analysis',
      'Risk management consensus',
      'Fast inference with Groq Llama models',
      'Memory-based learning from past trades',
    ],
    usage: {
      method: 'POST',
      endpoint: '/api/groq-debate',
      body: {
        symbol: 'string (required) - Stock ticker symbol',
        date: 'string (optional) - Analysis date in YYYY-MM-DD format',
        max_debate_rounds: 'number (optional) - Number of debate rounds (default: 2)',
      },
      example: {
        symbol: 'AAPL',
        date: '2024-12-11',
        max_debate_rounds: 2,
      },
    },
    llm_provider: 'Groq',
    models: {
      deep_think: 'llama-3.3-70b-versatile',
      quick_think: 'llama-3.1-8b-instant',
    },
  })
}

// Helper functions to extract information from the debate result
function extractBullArguments(result: any): string[] {
  const args: string[] = []

  if (result.bull_case) {
    args.push(result.bull_case)
  }

  if (result.debate_history) {
    result.debate_history.forEach((entry: any) => {
      if (entry.agent === 'bull_researcher' && entry.message) {
        args.push(entry.message)
      }
    })
  }

  return args.length > 0 ? args : ['Bull arguments available in full debate history']
}

function extractBearArguments(result: any): string[] {
  const args: string[] = []

  if (result.bear_case) {
    args.push(result.bear_case)
  }

  if (result.debate_history) {
    result.debate_history.forEach((entry: any) => {
      if (entry.agent === 'bear_researcher' && entry.message) {
        args.push(entry.message)
      }
    })
  }

  return args.length > 0 ? args : ['Bear arguments available in full debate history']
}

function extractRiskAssessment(result: any): string {
  if (result.risk_assessment) {
    return result.risk_assessment
  }

  if (result.risk_manager_decision) {
    return result.risk_manager_decision
  }

  return 'Risk assessment available in full analysis'
}

function extractFinalDecision(result: any): string {
  if (result.final_decision) {
    return result.final_decision
  }

  if (result.trading_decision) {
    return result.trading_decision
  }

  if (result.decision) {
    return result.decision
  }

  return 'Decision available in full analysis'
}

function extractConfidence(result: any): string {
  if (result.confidence) {
    return result.confidence
  }

  if (result.confidence_level) {
    return result.confidence_level
  }

  return 'Medium'
}

function extractReasoning(result: any): string {
  if (result.reasoning) {
    return result.reasoning
  }

  if (result.analysis_summary) {
    return result.analysis_summary
  }

  return 'Full reasoning available in debate history'
}
