import { NextRequest, NextResponse } from 'next/server'

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

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: symbol' },
        { status: 400 }
      )
    }

    // Get debate-analyst URL from environment
    const debateAnalystUrl = process.env.NEXT_PUBLIC_DEBATE_ANALYST_URL || 'http://localhost:8001'

    // Use unified API gateway if available
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
    const analyzeUrl = apiBaseUrl
      ? `${apiBaseUrl}/debate-analyst/analyze`
      : `${debateAnalystUrl}/analyze`

    console.log(`Calling Groq debate analysis for ${symbol}...`)

    // Call the debate-analyst service
    const response = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol,
        date: date || new Date().toISOString().split('T')[0],
        max_debate_rounds,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Debate analyst error:', errorText)
      return NextResponse.json(
        {
          success: false,
          error: `Debate analyst service error: ${response.status} ${response.statusText}`
        },
        { status: response.status }
      )
    }

    const result = await response.json()

    // Transform the response to a more user-friendly format
    const analysis: GroqDebateResponse = {
      success: true,
      symbol: result.symbol || symbol,
      date: result.date || date || new Date().toISOString().split('T')[0],
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
