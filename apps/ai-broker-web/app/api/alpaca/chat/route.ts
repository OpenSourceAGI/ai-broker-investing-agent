import { NextRequest, NextResponse } from 'next/server'
import { createLLM } from '@/packages/investing/src/trading-agents/utils/llm-client'
import { AgentExecutor, tradingTools } from '@/packages/investing/src/trading-agents/tools/langchain-tools'
import { TradingConfig } from '@/packages/investing/src/trading-agents/types'

export const runtime = 'nodejs'
export const maxDuration = 60

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      )
    }

    // Get the latest user message
    const userMessage = messages.filter((m: any) => m.role === 'user').pop()

    if (!userMessage) {
      return NextResponse.json(
        { error: 'No user message found' },
        { status: 400 }
      )
    }

    // Create LLM configuration for Groq
    const config: TradingConfig = {
      llmProvider: 'groq',
      deepThinkLLM: 'llama-3.3-70b-versatile',
      quickThinkLLM: 'llama-3.1-8b-instant',
      temperature: 0.7,
      apiKeys: {
        groq: process.env.GROQ_API_KEY || process.env.XAI_API_KEY
      }
    }

    // Check if GROQ API key is available
    if (!config.apiKeys?.groq) {
      return NextResponse.json({
        role: 'assistant',
        content: '⚠️ GROQ API key is not configured. Please add GROQ_API_KEY to your environment variables.\n\nGet your free API key at: https://console.groq.com/keys',
        timestamp: new Date().toISOString(),
      })
    }

    // Create LLM instance (use quick think for faster responses)
    const llm = createLLM(config, config.quickThinkLLM)

    // Determine if the query needs tools or just a simple response
    const needsTools = /analyze|calculate|get|fetch|show|find|compare|strategy|backtest|data|indicators/i.test(userMessage.content)

    let responseContent: string

    if (needsTools) {
      // Use agent executor with tools for complex queries
      const agent = new AgentExecutor(llm, tradingTools, 10)

      try {
        responseContent = await agent.run(userMessage.content)
      } catch (error: any) {
        console.error('Agent execution error:', error)
        responseContent = `I encountered an error while processing your request: ${error.message}\n\nPlease try rephrasing your question or ask something simpler.`
      }
    } else {
      // Direct LLM call for general questions
      const systemPrompt = `You are an expert trading strategy assistant for the Alpaca Trading Platform. 

You help users:
- Understand different trading strategies (momentum, mean reversion, breakout, etc.)
- Design custom trading rules and conditions
- Set up proper risk management
- Configure trading parameters

Keep responses concise, actionable, and trading-focused.
When suggesting strategies, always emphasize risk management.
Use examples with popular stocks like AAPL, TSLA, NVDA when helpful.`

      const fullPrompt = `${systemPrompt}\n\nUser: ${userMessage.content}\n\nAssistant:`

      try {
        const response = await llm.invoke(fullPrompt)
        responseContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
      } catch (error: any) {
        console.error('LLM invocation error:', error)
        responseContent = `Sorry, I encountered an error: ${error.message}\n\nPlease try again or rephrase your question.`
      }
    }

    // Generate relevant suggestions based on the context
    const suggestions = generateSuggestions(userMessage.content, responseContent)

    return NextResponse.json({
      role: 'assistant',
      content: responseContent,
      timestamp: new Date().toISOString(),
      suggestions,
    })

  } catch (error: any) {
    console.error('Alpaca chat error:', error)

    return NextResponse.json(
      { error: error.message || 'Failed to process chat message' },
      { status: 500 }
    )
  }
}

// Helper function to generate context-aware suggestions
function generateSuggestions(userQuery: string, response: string): string[] {
  const query = userQuery.toLowerCase()
  const resp = response.toLowerCase()

  // Topic-based suggestions
  if (query.includes('momentum') || resp.includes('momentum')) {
    return [
      'How do I set up a momentum strategy for tech stocks?',
      'What are good risk management rules for momentum trading?',
      'Show me an example momentum strategy with RSI and MACD'
    ]
  }

  if (query.includes('mean reversion') || resp.includes('mean reversion')) {
    return [
      'Create a mean reversion strategy for volatile stocks',
      'What indicators work best for mean reversion?',
      'How do I backtest a mean reversion strategy?'
    ]
  }

  if (query.includes('breakout') || resp.includes('breakout')) {
    return [
      'Design a breakout strategy with volume confirmation',
      'What are common false breakout filters?',
      'Show me a profitable breakout strategy example'
    ]
  }

  if (query.includes('risk') || resp.includes('risk management')) {
    return [
      "What's a good stop loss percentage?",
      'How do I calculate position size?',
      'Explain the risk/reward ratio for day trading'
    ]
  }

  if (query.includes('strategy') || query.includes('create') || query.includes('build')) {
    return [
      'What are the components of a good trading strategy?',
      'Help me create a strategy for swing trading',
      'Show me backtesting results for different strategies'
    ]
  }

  // Default suggestions
  return [
    'Help me create a momentum trading strategy',
    'What are the best indicators for day trading?',
    'Explain stop loss and take profit settings'
  ]
}
