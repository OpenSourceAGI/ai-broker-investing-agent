import { NextRequest, NextResponse } from 'next/server'
import { TradingAgentsGraph } from '@/packages/investing/src/trading-agents'
import { db } from '@/lib/db'
import { agentApiLogs } from '@/lib/db/schema'
import { nanoid } from 'nanoid'

interface TradingAgentsRequest {
  symbol: string
  date?: string
  analysts?: Array<'market' | 'social' | 'news' | 'fundamentals'>
  config?: {
    llmProvider?: string
    deepThinkLLM?: string
    quickThinkLLM?: string
    temperature?: number
  }
}

interface TradingAgentsResponse {
  success: boolean
  symbol: string
  date: string
  signal: {
    action: 'BUY' | 'SELL' | 'HOLD'
    confidence: number
    reasoning: string
    timestamp: string
  }
  analysis: {
    marketReport: string
    sentimentReport: string
    newsReport: string
    fundamentalsReport: string
    investmentDebate: {
      bullArguments: string
      bearArguments: string
      judgeDecision: string
    }
    traderDecision: string
  }
  error?: string
}

/**
 * POST /api/trading-agents
 * Run the multi-agent trading system to get a trading signal
 */
export async function POST(request: NextRequest) {
  try {
    const body: TradingAgentsRequest = await request.json()
    const { symbol, date, analysts, config } = body

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Symbol is required' },
        { status: 400 }
      )
    }

    // Use current date if not provided
    const tradeDate = date || new Date().toISOString().split('T')[0]

    // Determine LLM provider from config, environment, or default
    const llmProvider = config?.llmProvider ||
                       process.env.NEXT_PUBLIC_LLM_PROVIDER ||
                       (process.env.GROQ_API_KEY ? 'groq' : 'openai')

    // Set default models based on provider
    let defaultDeepThink = 'gpt-4o'
    let defaultQuickThink = 'gpt-4o-mini'

    if (llmProvider === 'groq') {
      defaultDeepThink = process.env.NEXT_PUBLIC_GROQ_DEEP_THINK_MODEL || 'llama-3.3-70b-versatile'
      defaultQuickThink = process.env.NEXT_PUBLIC_GROQ_QUICK_THINK_MODEL || 'llama-3.1-8b-instant'
    } else if (llmProvider === 'anthropic') {
      defaultDeepThink = 'claude-3-5-sonnet-20241022'
      defaultQuickThink = 'claude-3-5-haiku-20241022'
    }

    // Initialize TradingAgentsGraph
    const selectedAnalysts = analysts || ['market', 'social', 'news', 'fundamentals']
    const tradingConfig = {
      llmProvider,
      deepThinkLLM: config?.deepThinkLLM || defaultDeepThink,
      quickThinkLLM: config?.quickThinkLLM || defaultQuickThink,
      temperature: config?.temperature || 0.3,
      apiKeys: {
        openai: process.env.OPENAI_API_KEY || '',
        groq: process.env.GROQ_API_KEY || '',
        anthropic: process.env.ANTHROPIC_API_KEY || ''
      }
    }

    const graph = new TradingAgentsGraph(selectedAnalysts, false, tradingConfig)

    // Run the analysis
    const { state, signal } = await graph.propagate(symbol, tradeDate)

    // Format response
    const response: TradingAgentsResponse = {
      success: true,
      symbol,
      date: tradeDate,
      signal: {
        action: signal.action,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        timestamp: signal.timestamp.toISOString()
      },
      analysis: {
        marketReport: state.marketReport,
        sentimentReport: state.sentimentReport,
        newsReport: state.newsReport,
        fundamentalsReport: state.fundamentalsReport,
        investmentDebate: {
          bullArguments: state.investmentDebateState.bullHistory,
          bearArguments: state.investmentDebateState.bearHistory,
          judgeDecision: state.investmentDebateState.judgeDecision
        },
        traderDecision: state.traderInvestmentPlan
      }
    }

    // Log the API call
    try {
      await db.insert(agentApiLogs).values({
        id: nanoid(),
        symbol,
        requestPayload: JSON.stringify(body),
        responseSignal: JSON.stringify(response.signal),
        responseAnalysis: JSON.stringify(response.analysis),
        llmProvider: tradingConfig.llmProvider,
        model: tradingConfig.deepThinkLLM, // Using deepThinkLLM as the primary model reference
        timestamp: new Date(),
        createdAt: new Date()
      })
    } catch (logError) {
      console.error('Failed to log agent API call:', logError)
      // Continue execution, don't fail the request if logging fails
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('TradingAgents error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to run trading agents analysis'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/trading-agents
 * Get information about the trading agents system or fetch execution logs
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')
  const limit = parseInt(searchParams.get('limit') || '50')

  // If action is history, return logs
  if (action === 'history') {
    try {
      const logs = await db.query.agentApiLogs.findMany({
        orderBy: (logs, { desc }) => [desc(logs.timestamp)],
        limit: limit
      })
      return NextResponse.json(logs)
    } catch (error) {
      console.error('Failed to fetch agent logs:', error)
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
    }
  }

  const currentProvider = process.env.NEXT_PUBLIC_LLM_PROVIDER ||
                         (process.env.GROQ_API_KEY ? 'groq' : 'openai')

  return NextResponse.json({
    name: 'TradingAgents Multi-Agent System',
    description: 'A multi-agent trading system that uses debate and consensus to generate trading signals',
    version: '1.0.0',
    currentProvider,
    supportedProviders: ['openai', 'groq', 'anthropic'],
    analysts: ['market', 'social', 'news', 'fundamentals'],
    features: [
      'Technical market analysis with indicators',
      'Bull vs Bear debate for investment decisions',
      'Risk management consensus',
      'Memory-based learning from past decisions',
      'Multiple LLM provider support (OpenAI, Groq, Anthropic)',
      'Fast inference with Groq for real-time analysis'
    ],
    defaultModels: {
      groq: {
        deepThink: 'llama-3.1-70b-versatile',
        quickThink: 'llama-3.1-8b-instant'
      },
      openai: {
        deepThink: 'gpt-4o',
        quickThink: 'gpt-4o-mini'
      },
      anthropic: {
        deepThink: 'claude-3-5-sonnet-20241022',
        quickThink: 'claude-3-5-haiku-20241022'
      }
    },
    usage: {
      endpoint: 'POST /api/trading-agents',
      parameters: {
        symbol: 'Stock symbol (required)',
        date: 'Trade date in YYYY-MM-DD format (optional, defaults to today)',
        analysts: 'Array of analyst types to use (optional, defaults to all)',
        config: {
          llmProvider: 'LLM provider: openai, groq, or anthropic (optional)',
          deepThinkLLM: 'Model for complex reasoning (optional)',
          quickThinkLLM: 'Model for fast analysis (optional)',
          temperature: 'Temperature setting 0-1 (optional, default 0.3)'
        }
      },
      examples: {
        basic: {
          symbol: 'AAPL'
        },
        withGroq: {
          symbol: 'TSLA',
          config: {
            llmProvider: 'groq',
            deepThinkLLM: 'llama-3.1-70b-versatile',
            quickThinkLLM: 'llama-3.1-8b-instant'
          }
        },
        customAnalysts: {
          symbol: 'NVDA',
          analysts: ['market', 'news'],
          config: {
            llmProvider: 'groq'
          }
        }
      }
    }
  })
}
