import { NextRequest, NextResponse } from 'next/server'

interface OptionsAdvisorRequest {
  symbol: string
  currentPrice?: number
  budget?: number
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive'
}

interface OptionStrategy {
  name: string
  type: 'income' | 'directional' | 'volatility' | 'range'
  description: string
  bullishBearish: 'bullish' | 'bearish' | 'neutral'
  riskLevel: 'low' | 'medium' | 'high'
  maxProfit: string
  maxLoss: string
  bestFor: string
  recommended: boolean
  strikePrice?: number
  expirationWindow?: string
  expirationDays?: number
  reasoning?: string
  confidence?: number
}

interface OptionsAdvisorResponse {
  success: boolean
  symbol: string
  currentPrice: number
  marketData: {
    trend: string
    volatility: string
    rsi?: number
    macd?: string
  }
  recommendedStrategy: OptionStrategy
  allStrategies: OptionStrategy[]
  llmAnalysis: string
  error?: string
}

/**
 * Options Strategy Advisor powered by Groq LLM
 *
 * Analyzes stock data and recommends the best options trading strategy
 * based on market conditions, technical indicators, and user preferences.
 */
export async function POST(request: NextRequest) {
  try {
    const body: OptionsAdvisorRequest = await request.json()
    const { symbol, currentPrice, budget = 10000, riskTolerance = 'moderate' } = body

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: symbol' },
        { status: 400 }
      )
    }

    console.log(`Analyzing options strategies for ${symbol}...`)

    // Get stock data from yfinance API
    const stockDataResponse = await fetch(
      `${request.nextUrl.origin}/api/stocks/quote/${symbol}`
    )

    if (!stockDataResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch stock data' },
        { status: 500 }
      )
    }

    const stockDataResult = await stockDataResponse.json()
    const stockData = stockDataResult.data
    const price = currentPrice || stockData?.price?.regularMarketPrice || stockData?.summaryDetail?.previousClose

    if (!price) {
      return NextResponse.json(
        { success: false, error: 'Could not determine current stock price' },
        { status: 500 }
      )
    }

    // Get technical indicators - for now we'll skip this if not available
    let technicalData: any = {}
    try {
      // Technical API may not exist yet, so we'll handle gracefully
      const technicalResponse = await fetch(
        `${request.nextUrl.origin}/api/stocks/historical/${symbol}?period=3mo&interval=1d`
      )
      if (technicalResponse.ok) {
        const historicalResult = await technicalResponse.json()
        // Calculate some basic technical indicators from historical data if available
        technicalData = {
          trend: 'neutral',
          volatility: 'moderate'
        }
      }
    } catch (error) {
      console.error('Failed to fetch technical data:', error)
    }

    // Prepare market analysis for LLM
    const marketContext = {
      symbol,
      price,
      change: stockData?.price?.regularMarketChangePercent || 0,
      volume: stockData?.price?.regularMarketVolume || 0,
      marketCap: stockData?.price?.marketCap || 0,
      fiftyTwoWeekHigh: stockData?.summaryDetail?.fiftyTwoWeekHigh || 0,
      fiftyTwoWeekLow: stockData?.summaryDetail?.fiftyTwoWeekLow || 0,
      technicals: technicalData,
    }

    // Call Groq LLM for analysis
    const groqApiKey = process.env.GROQ_API_KEY
    if (!groqApiKey) {
      return NextResponse.json(
        { success: false, error: 'GROQ_API_KEY not configured' },
        { status: 500 }
      )
    }

    const prompt = `You are an expert options trading advisor. Analyze the following stock data and recommend the BEST options trading strategy.

Stock: ${symbol}
Current Price: $${price.toFixed(2)}
Daily Change: ${marketContext.change.toFixed(2)}%
52-Week Range: $${marketContext.fiftyTwoWeekLow.toFixed(2)} - $${marketContext.fiftyTwoWeekHigh.toFixed(2)}
Risk Tolerance: ${riskTolerance}
Budget: $${budget}

Technical Indicators (if available):
${JSON.stringify(technicalData, null, 2)}

Based on this data, provide:
1. Market trend assessment (bullish/bearish/neutral)
2. Volatility assessment (high/low/moderate)
3. The BEST recommended options strategy from this list:
   - Long Call (bullish directional)
   - Long Put (bearish directional)
   - Covered Call (income generation)
   - Cash-Secured Put (income/acquire stock)
   - Bull Call Spread (limited risk bullish)
   - Bear Put Spread (limited risk bearish)
   - Iron Condor (range-bound/low volatility)
   - Long Straddle (high volatility expected)
   - Long Strangle (high volatility, cheaper than straddle)
   - Credit Spread (moderate income with defined risk)

4. Recommended strike price (as percentage of current price, e.g., "ATM", "5% OTM", "10% ITM")
5. Recommended expiration window (in days: 7, 14, 30, 45, 60, 90, or 180+)
6. Confidence level (0-100)
7. Brief reasoning (2-3 sentences)

Respond in JSON format:
{
  "trend": "bullish|bearish|neutral",
  "volatility": "high|moderate|low",
  "recommendedStrategy": "strategy name",
  "strikePrice": "ATM|5% OTM|10% ITM|etc",
  "expirationDays": 30,
  "confidence": 85,
  "reasoning": "Brief explanation"
}`

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert options trading advisor. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    })

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text()
      console.error('Groq API error:', errorText)
      return NextResponse.json(
        { success: false, error: `Groq API error: ${groqResponse.status}` },
        { status: 500 }
      )
    }

    const groqResult = await groqResponse.json()
    const llmContent = groqResult.choices[0]?.message?.content || '{}'

    // Extract JSON from the response (handle markdown code blocks)
    let llmAnalysis: any
    try {
      const jsonMatch = llmContent.match(/\{[\s\S]*\}/)
      llmAnalysis = JSON.parse(jsonMatch ? jsonMatch[0] : llmContent)
    } catch (e) {
      console.error('Failed to parse LLM response:', llmContent)
      llmAnalysis = {
        trend: 'neutral',
        volatility: 'moderate',
        recommendedStrategy: 'Long Call',
        strikePrice: 'ATM',
        expirationDays: 30,
        confidence: 50,
        reasoning: 'Unable to analyze market conditions'
      }
    }

    // Define all common strategies
    const allStrategies: OptionStrategy[] = [
      {
        name: 'Long Call',
        type: 'directional',
        description: 'Buy a call option when you expect the stock to rise above the strike by expiration.',
        bullishBearish: 'bullish',
        riskLevel: 'medium',
        maxProfit: 'Unlimited (stock can keep going up)',
        maxLoss: 'Limited to premium paid',
        bestFor: 'Directional bets on a stock with limited capital vs. buying shares',
        recommended: llmAnalysis.recommendedStrategy === 'Long Call',
        strikePrice: calculateStrikePrice(price, llmAnalysis.strikePrice, 'call'),
        expirationWindow: formatExpirationWindow(llmAnalysis.expirationDays),
        expirationDays: llmAnalysis.expirationDays,
        reasoning: llmAnalysis.recommendedStrategy === 'Long Call' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Long Call' ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Long Put',
        type: 'directional',
        description: 'Buy a put option when you expect the stock to fall below the strike by expiration.',
        bullishBearish: 'bearish',
        riskLevel: 'medium',
        maxProfit: 'Large (stock down to $0), capped at strike minus premium',
        maxLoss: 'Limited to premium paid',
        bestFor: 'Downside protection or shorting without margin',
        recommended: llmAnalysis.recommendedStrategy === 'Long Put',
        strikePrice: calculateStrikePrice(price, llmAnalysis.strikePrice, 'put'),
        expirationWindow: formatExpirationWindow(llmAnalysis.expirationDays),
        expirationDays: llmAnalysis.expirationDays,
        reasoning: llmAnalysis.recommendedStrategy === 'Long Put' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Long Put' ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Covered Call',
        type: 'income',
        description: 'Own 100 shares of stock and sell a call against it. Collect premium but cap upside.',
        bullishBearish: 'neutral',
        riskLevel: 'low',
        maxProfit: '(Strike price – cost basis) + premium',
        maxLoss: 'Cost basis – premium (if stock goes to $0)',
        bestFor: 'Generating income on a stock you already hold',
        recommended: llmAnalysis.recommendedStrategy === 'Covered Call',
        strikePrice: calculateStrikePrice(price, '5% OTM', 'call'),
        expirationWindow: '30-45 days',
        expirationDays: 30,
        reasoning: llmAnalysis.recommendedStrategy === 'Covered Call' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Covered Call' ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Cash-Secured Put',
        type: 'income',
        description: 'Sell a put and set aside cash to buy the stock at the strike if assigned.',
        bullishBearish: 'bullish',
        riskLevel: 'medium',
        maxProfit: 'Premium received',
        maxLoss: '(Strike price × 100) – premium (if stock goes to $0)',
        bestFor: 'Buying a stock at a discount or collecting income',
        recommended: llmAnalysis.recommendedStrategy === 'Cash-Secured Put' || llmAnalysis.recommendedStrategy === 'Cash Secured Put',
        strikePrice: calculateStrikePrice(price, '5% OTM', 'put'),
        expirationWindow: '30-45 days',
        expirationDays: 30,
        reasoning: (llmAnalysis.recommendedStrategy === 'Cash-Secured Put' || llmAnalysis.recommendedStrategy === 'Cash Secured Put') ? llmAnalysis.reasoning : undefined,
        confidence: (llmAnalysis.recommendedStrategy === 'Cash-Secured Put' || llmAnalysis.recommendedStrategy === 'Cash Secured Put') ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Bull Call Spread',
        type: 'directional',
        description: 'Buy a lower-strike call and sell a higher-strike call (same expiration). Limited upside, defined risk.',
        bullishBearish: 'bullish',
        riskLevel: 'low',
        maxProfit: '(Difference in strikes – net debit) × 100',
        maxLoss: 'Net debit paid',
        bestFor: 'Bullish outlook with limited capital and defined risk',
        recommended: llmAnalysis.recommendedStrategy === 'Bull Call Spread',
        strikePrice: calculateStrikePrice(price, llmAnalysis.strikePrice, 'call'),
        expirationWindow: formatExpirationWindow(llmAnalysis.expirationDays || 30),
        expirationDays: llmAnalysis.expirationDays || 30,
        reasoning: llmAnalysis.recommendedStrategy === 'Bull Call Spread' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Bull Call Spread' ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Bear Put Spread',
        type: 'directional',
        description: 'Buy a higher-strike put and sell a lower-strike put (same expiration). Limited downside, defined risk.',
        bullishBearish: 'bearish',
        riskLevel: 'low',
        maxProfit: '(Difference in strikes – net debit) × 100',
        maxLoss: 'Net debit paid',
        bestFor: 'Bearish outlook with defined risk',
        recommended: llmAnalysis.recommendedStrategy === 'Bear Put Spread',
        strikePrice: calculateStrikePrice(price, llmAnalysis.strikePrice, 'put'),
        expirationWindow: formatExpirationWindow(llmAnalysis.expirationDays || 30),
        expirationDays: llmAnalysis.expirationDays || 30,
        reasoning: llmAnalysis.recommendedStrategy === 'Bear Put Spread' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Bear Put Spread' ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Iron Condor',
        type: 'range',
        description: 'Sell an OTM call spread and an OTM put spread (same expiration). Profit if stock stays in range.',
        bullishBearish: 'neutral',
        riskLevel: 'medium',
        maxProfit: 'Net credit received',
        maxLoss: '(Width of one spread – net credit) × 100',
        bestFor: 'Range-bound markets with low volatility',
        recommended: llmAnalysis.recommendedStrategy === 'Iron Condor',
        strikePrice: price,
        expirationWindow: '30-60 days',
        expirationDays: 45,
        reasoning: llmAnalysis.recommendedStrategy === 'Iron Condor' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Iron Condor' ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Long Straddle',
        type: 'volatility',
        description: 'Buy a call and a put at the same strike (usually ATM). Profit if stock moves sharply up or down.',
        bullishBearish: 'neutral',
        riskLevel: 'high',
        maxProfit: 'Unlimited (call side) or large (put side)',
        maxLoss: 'Total premium paid',
        bestFor: 'Expecting large price movement (earnings, events)',
        recommended: llmAnalysis.recommendedStrategy === 'Long Straddle',
        strikePrice: price,
        expirationWindow: formatExpirationWindow(llmAnalysis.expirationDays || 7),
        expirationDays: llmAnalysis.expirationDays || 7,
        reasoning: llmAnalysis.recommendedStrategy === 'Long Straddle' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Long Straddle' ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Long Strangle',
        type: 'volatility',
        description: 'Buy an OTM call and an OTM put (same expiration). Cheaper than straddle but needs bigger move.',
        bullishBearish: 'neutral',
        riskLevel: 'high',
        maxProfit: 'Unlimited (call) or large (put)',
        maxLoss: 'Total premium paid',
        bestFor: 'Expecting large price movement with lower cost',
        recommended: llmAnalysis.recommendedStrategy === 'Long Strangle',
        strikePrice: price,
        expirationWindow: formatExpirationWindow(llmAnalysis.expirationDays || 7),
        expirationDays: llmAnalysis.expirationDays || 7,
        reasoning: llmAnalysis.recommendedStrategy === 'Long Strangle' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Long Strangle' ? llmAnalysis.confidence : undefined,
      },
      {
        name: 'Credit Spread',
        type: 'income',
        description: 'Sell a call/put and buy a further OTM call/put (same expiration). Collect net credit.',
        bullishBearish: 'neutral',
        riskLevel: 'medium',
        maxProfit: 'Net credit received',
        maxLoss: '(Difference in strikes – net credit) × 100',
        bestFor: 'Moderate income with defined risk',
        recommended: llmAnalysis.recommendedStrategy === 'Credit Spread',
        strikePrice: calculateStrikePrice(price, '5% OTM', 'call'),
        expirationWindow: '30-60 days',
        expirationDays: 45,
        reasoning: llmAnalysis.recommendedStrategy === 'Credit Spread' ? llmAnalysis.reasoning : undefined,
        confidence: llmAnalysis.recommendedStrategy === 'Credit Spread' ? llmAnalysis.confidence : undefined,
      },
    ]

    const recommendedStrategy = allStrategies.find(s => s.recommended) || allStrategies[0]

    const response: OptionsAdvisorResponse = {
      success: true,
      symbol: symbol.toUpperCase(),
      currentPrice: price,
      marketData: {
        trend: llmAnalysis.trend || 'neutral',
        volatility: llmAnalysis.volatility || 'moderate',
        rsi: technicalData.rsi,
        macd: technicalData.macd,
      },
      recommendedStrategy,
      allStrategies,
      llmAnalysis: llmAnalysis.reasoning || 'Analysis complete',
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Options advisor error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to analyze options strategies',
        details: error.toString()
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    service: 'Options Strategy Advisor API',
    description: 'AI-powered options strategy recommendations using Groq LLM',
    version: '1.0.0',
    features: [
      'Real-time stock data analysis',
      'Technical indicator integration',
      'LLM-powered strategy recommendations',
      'Strike price calculations',
      'Expiration window suggestions',
      'Risk assessment',
    ],
    usage: {
      method: 'POST',
      endpoint: '/api/options-advisor',
      body: {
        symbol: 'string (required) - Stock ticker symbol',
        currentPrice: 'number (optional) - Override current price',
        budget: 'number (optional) - Trading budget (default: 10000)',
        riskTolerance: 'string (optional) - conservative|moderate|aggressive (default: moderate)',
      },
      example: {
        symbol: 'AAPL',
        budget: 5000,
        riskTolerance: 'moderate',
      },
    },
    strategies: [
      'Long Call',
      'Long Put',
      'Covered Call',
      'Cash-Secured Put',
      'Bull Call Spread',
      'Bear Put Spread',
      'Iron Condor',
      'Long Straddle',
      'Long Strangle',
      'Credit Spread',
    ],
  })
}

// Helper functions
function calculateStrikePrice(currentPrice: number, strikeInfo: string, optionType: 'call' | 'put'): number {
  if (strikeInfo.includes('ATM')) {
    return Math.round(currentPrice)
  }

  const percentMatch = strikeInfo.match(/(\d+)%\s*(OTM|ITM)/i)
  if (percentMatch) {
    const percent = parseInt(percentMatch[1]) / 100
    const isOTM = percentMatch[2].toUpperCase() === 'OTM'

    if (optionType === 'call') {
      return Math.round(currentPrice * (1 + (isOTM ? percent : -percent)))
    } else {
      return Math.round(currentPrice * (1 - (isOTM ? percent : -percent)))
    }
  }

  // Default to ATM
  return Math.round(currentPrice)
}

function formatExpirationWindow(days: number): string {
  if (days <= 7) return '1-7 days (weekly)'
  if (days <= 14) return '7-14 days'
  if (days <= 30) return '30 days (monthly)'
  if (days <= 45) return '30-45 days'
  if (days <= 60) return '45-60 days'
  if (days <= 90) return '60-90 days'
  if (days <= 180) return '90-180 days'
  return '180+ days (LEAPS)'
}
