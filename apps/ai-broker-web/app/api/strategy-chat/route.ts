import { NextRequest, NextResponse } from 'next/server'
import { createLLM } from '@/packages/investing/src/trading-agents/utils/llm-client'
import { TradingConfig } from '@/packages/investing/src/trading-agents/types'
import {
  safeAlpacaTools,
  alpacaMCPTools
} from '@/packages/investing/src/trading-agents/tools/alpaca-mcp-tools'
import {
  tradingTools,
  toolsToOpenAIFunctions,
  executeTool
} from '@/packages/investing/src/trading-agents/tools/langchain-tools'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: Date
}

interface ChatRequest {
  messages: ChatMessage[]
  enableMCPTools?: boolean  // Enable Alpaca MCP tools for live trading operations
  enableDataTools?: boolean  // Enable stock data and analysis tools
}

interface ChatResponse {
  role: 'assistant'
  content: string
  timestamp: Date
  suggestions: string[]
}

/**
 * Strategy Chat API - Powered by Groq and LangChain
 *
 * This endpoint provides AI-powered trading strategy assistance using Groq's
 * fast LLama models for real-time chat interactions.
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json()
    const { messages, enableMCPTools = false, enableDataTools = true } = body

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      )
    }

    // Check for API key
    const groqApiKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY
    if (!groqApiKey) {
      return NextResponse.json(
        {
          error: 'GROQ_API_KEY not configured',
          fallback: true,
          role: 'assistant',
          content: 'I apologize, but the AI service is not configured. Please set the GROQ_API_KEY environment variable.\n\nHere are some general strategy suggestions:\n\n1. **Momentum Strategy**: Buy when price crosses above 20-day MA, sell when crosses below\n2. **Mean Reversion**: Buy on RSI < 30, sell on RSI > 70\n3. **Breakout Strategy**: Buy when price breaks above resistance with volume',
          timestamp: new Date(),
          suggestions: [
            'Tell me about momentum strategies',
            'Explain mean reversion trading',
            'Show me breakout strategy examples'
          ]
        },
        { status: 200 }
      )
    }

    // Configure Groq LLM
    const config: TradingConfig = {
      llmProvider: 'groq',
      deepThinkLLM: 'llama-3.3-70b-versatile',
      quickThinkLLM: 'llama-3.1-8b-instant',
      temperature: 0.7,
      apiKeys: {
        groq: groqApiKey
      }
    }

    // Use the deep-thinking Llama 3.3 model for high-quality trading advice
    const llm = createLLM(config, config.deepThinkLLM!)

    // Combine available tools based on configuration
    const availableTools = [
      ...(enableDataTools ? tradingTools : []),
      ...(enableMCPTools ? safeAlpacaTools : [])  // Only safe (read-only) tools for now
    ]

    // Build system prompt for trading strategy assistant
    const toolsDescription = availableTools.length > 0
      ? `\n\nYou have access to the following tools:\n${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}\n\nUse these tools when appropriate to provide accurate, real-time information.`
      : ''

    const systemPrompt = `You are an expert trading strategy assistant specialized in algorithmic trading. Your role is to help users:
- Understand different trading strategies (momentum, mean reversion, breakout, pairs trading, etc.)
- Design custom trading rules based on technical indicators
- Configure risk management parameters (stop loss, take profit, position sizing)
- Optimize entry and exit conditions
- Understand market conditions and when to apply each strategy
${enableMCPTools ? '- Access live market data and account information via Alpaca\n- Help analyze current positions and portfolio status' : ''}

Provide clear, actionable advice. When suggesting strategies, include:
1. Entry conditions (specific indicators and values for when to buy)
2. Exit conditions (specific indicators and values for when to sell)
3. Risk management (stop loss %, take profit %, position size %)
4. Suitable indicators (RSI, MACD, SMA, EMA, Bollinger Bands, etc.)
5. Market conditions where the strategy works best

Keep responses concise, practical, and well-formatted using markdown. Focus on actionable trading rules that can be implemented programmatically.${toolsDescription}`

    // Convert chat messages to LLM format
    const llmMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(msg => ({
        role: msg.role === 'system' ? 'system' as const :
              msg.role === 'assistant' ? 'assistant' as const :
              'user' as const,
        content: msg.content
      }))
    ]

    // Get response from Groq with tools if available
    let response
    let finalContent = ''

    if (availableTools.length > 0) {
      // Use tools with the LLM
      const tools = toolsToOpenAIFunctions(availableTools)
      response = await llm.invokeWithTools(llmMessages, tools)

      // Handle tool calls
      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults: string[] = []

        for (const toolCall of response.toolCalls) {
          try {
            // Execute the tool
            const toolResult = await executeTool(toolCall.name, toolCall.arguments)
            toolResults.push(`**${toolCall.name}**:\n${toolResult}`)
          } catch (error: any) {
            toolResults.push(`**${toolCall.name}** error: ${error.message}`)
          }
        }

        // Create follow-up message with tool results
        const followUpMessages = [
          ...llmMessages,
          {
            role: 'assistant' as const,
            content: response.content || 'Using tools to get information...'
          },
          {
            role: 'user' as const,
            content: `Tool results:\n\n${toolResults.join('\n\n')}\n\nBased on these results, provide your analysis and recommendations.`
          }
        ]

        // Get final response with tool results
        const finalResponse = await llm.invoke(followUpMessages)
        finalContent = finalResponse.content
      } else {
        finalContent = response.content
      }
    } else {
      // No tools, direct response
      response = await llm.invoke(llmMessages)
      finalContent = response.content
    }

    // Generate follow-up suggestions based on response
    const suggestions = generateSuggestions(finalContent)

    const chatResponse: ChatResponse = {
      role: 'assistant',
      content: finalContent,
      timestamp: new Date(),
      suggestions
    }

    return NextResponse.json(chatResponse)

  } catch (error: any) {
    console.error('Strategy chat error:', error)

    return NextResponse.json(
      {
        error: 'Failed to process chat message',
        details: error.message,
        role: 'assistant',
        content: 'I encountered an error processing your request. Please try again or rephrase your question.',
        timestamp: new Date(),
        suggestions: [
          'What is a momentum trading strategy?',
          'Help me design a mean reversion strategy',
          'Explain risk management basics'
        ]
      },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint - Returns API information
 */
export async function GET() {
  return NextResponse.json({
    service: 'Strategy Chat API',
    description: 'AI-powered trading strategy assistant using Groq LLMs',
    version: '1.0.0',
    provider: 'Groq',
    model: 'llama-3.3-70b-versatile',
    features: [
      'Real-time strategy suggestions',
      'Custom trading rule design',
      'Risk management guidance',
      'Technical indicator recommendations',
      'Context-aware follow-up suggestions'
    ],
    usage: {
      method: 'POST',
      endpoint: '/api/strategy-chat',
      body: {
        messages: 'Array of chat messages with role (user/assistant/system) and content'
      },
      example: {
        messages: [
          { role: 'user', content: 'Help me create a momentum trading strategy' }
        ]
      }
    }
  })
}

/**
 * Generate relevant follow-up suggestions based on AI response
 */
function generateSuggestions(response: string): string[] {
  const suggestions: string[] = []

  // Check response content and suggest relevant follow-ups
  if (response.toLowerCase().includes('momentum')) {
    suggestions.push('Create a momentum strategy with custom parameters')
  }
  if (response.toLowerCase().includes('mean reversion')) {
    suggestions.push('Build a mean reversion strategy')
  }
  if (response.toLowerCase().includes('breakout')) {
    suggestions.push('Design a breakout trading strategy')
  }
  if (response.toLowerCase().includes('risk')) {
    suggestions.push('Help me set appropriate risk management')
  }
  if (response.toLowerCase().includes('indicator') || response.toLowerCase().includes('rsi') || response.toLowerCase().includes('macd')) {
    suggestions.push('What indicators should I use?')
  }
  if (response.toLowerCase().includes('entry') || response.toLowerCase().includes('exit')) {
    suggestions.push('How do I optimize entry and exit points?')
  }

  // Default suggestions if none matched
  if (suggestions.length === 0) {
    suggestions.push('Show me example strategies')
    suggestions.push('Help me with risk management')
    suggestions.push('Explain trading indicators')
  }

  // Limit to 3 suggestions
  return suggestions.slice(0, 3)
}
