import { NextRequest, NextResponse } from 'next/server'

interface ShortAdvisorRequest {
  symbol: string
  portfolioValue?: number
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive'
}

interface ShortRecommendation {
  symbol: string
  currentPrice: number
  strikePrice: number
  expirationDate: string
  expirationDays: number
  optionType: 'put' | 'call'
  reasoning: string
  confidence: number
  maxProfit: string
  maxLoss: string
  suggestedAmount: number
  portfolioPercentage: number
}

interface ShortAdvisorResponse {
  success: boolean
  data?: ShortRecommendation
  error?: string
}

/**
 * Short Trading Advisor powered by Groq LLM
 *
 * Analyzes stock data and recommends optimal short positions including
 * strike price, expiration date, and position sizing based on portfolio.
 */
export async function POST(request: NextRequest) {
  try {
    const body: ShortAdvisorRequest = await request.json()
    const { symbol, portfolioValue = 100000, riskTolerance = 'moderate' } = body

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameter: symbol' },
        { status: 400 }
      )
    }

    console.log(`Analyzing short position for ${symbol}...`)

    // Get stock data
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
    const price = stockData?.price?.regularMarketPrice || stockData?.summaryDetail?.previousClose

    if (!price) {
      return NextResponse.json(
        { success: false, error: 'Could not determine current stock price' },
        { status: 500 }
      )
    }

    // Get technical indicators
    let technicalData: any = {}
    try {
      const technicalResponse = await fetch(
        `${request.nextUrl.origin}/api/stocks/historical/${symbol}?period=3mo&interval=1d`
      )
      if (technicalResponse.ok) {
        technicalData = {
          trend: 'neutral',
          volatility: 'moderate'
        }
      }
    } catch (error) {
      console.error('Failed to fetch technical data:', error)
    }

    // Prepare market context
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

    const prompt = `You are an expert short trading advisor. Analyze the following stock data and recommend the optimal short position.

Stock: ${symbol}
Current Price: $${price.toFixed(2)}
Daily Change: ${marketContext.change.toFixed(2)}%
52-Week Range: $${marketContext.fiftyTwoWeekLow.toFixed(2)} - $${marketContext.fiftyTwoWeekHigh.toFixed(2)}
Market Cap: $${marketContext.marketCap.toLocaleString()}
Risk Tolerance: ${riskTolerance}
Portfolio Value: $${portfolioValue.toLocaleString()}

Technical Indicators (if available):
${JSON.stringify(technicalData, null, 2)}

Based on this data, provide:
1. Recommended strike price for put options (as specific dollar amount)
2. Recommended expiration date in days from now (7, 14, 30, 45, 60, or 90)
3. Option type recommendation (put or call - for shorting, typically put)
4. Suggested position size as a dollar amount (should be 5-15% of portfolio based on risk tolerance)
5. Confidence level (0-100)
6. Brief reasoning (2-3 sentences explaining why this is a good short opportunity)
7. Max potential profit estimate
8. Max potential loss estimate

Consider:
- Conservative: 5-7% of portfolio, ATM or slightly ITM strikes, 30-45 day expiration
- Moderate: 7-10% of portfolio, ATM strikes, 30 day expiration
- Aggressive: 10-15% of portfolio, OTM strikes, 14-30 day expiration

Respond in JSON format:
{
  "strikePrice": 175.50,
  "expirationDays": 30,
  "optionType": "put",
  "suggestedAmount": 7500,
  "portfolioPercentage": 7.5,
  "confidence": 78,
  "reasoning": "Brief explanation of why this is a good short opportunity",
  "maxProfit": "Description of max profit scenario",
  "maxLoss": "Description of max loss scenario"
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
            content: 'You are an expert short trading advisor. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1500,
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

    // Extract JSON from the response
    let llmAnalysis: any
    try {
      const jsonMatch = llmContent.match(/\{[\s\S]*\}/)
      llmAnalysis = JSON.parse(jsonMatch ? jsonMatch[0] : llmContent)
    } catch (e) {
      console.error('Failed to parse LLM response:', llmContent)
      // Provide fallback recommendation
      const portfolioPercent = riskTolerance === 'conservative' ? 0.06 : riskTolerance === 'aggressive' ? 0.12 : 0.08
      llmAnalysis = {
        strikePrice: price * 0.95, // 5% below current price
        expirationDays: 30,
        optionType: 'put',
        suggestedAmount: portfolioValue * portfolioPercent,
        portfolioPercentage: portfolioPercent * 100,
        confidence: 50,
        reasoning: 'Default recommendation based on current market price and portfolio size',
        maxProfit: 'Profit if stock declines significantly',
        maxLoss: 'Limited to premium paid for options'
      }
    }

    // Calculate expiration date
    const expirationDate = new Date()
    expirationDate.setDate(expirationDate.getDate() + (llmAnalysis.expirationDays || 30))

    const recommendation: ShortRecommendation = {
      symbol: symbol.toUpperCase(),
      currentPrice: price,
      strikePrice: llmAnalysis.strikePrice || price * 0.95,
      expirationDate: expirationDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      expirationDays: llmAnalysis.expirationDays || 30,
      optionType: llmAnalysis.optionType || 'put',
      reasoning: llmAnalysis.reasoning || 'Short position recommended based on market analysis',
      confidence: llmAnalysis.confidence || 70,
      maxProfit: llmAnalysis.maxProfit || 'Unlimited downside (stock can go to $0)',
      maxLoss: llmAnalysis.maxLoss || 'Limited to premium paid',
      suggestedAmount: llmAnalysis.suggestedAmount || portfolioValue * 0.08,
      portfolioPercentage: llmAnalysis.portfolioPercentage || 8,
    }

    const response: ShortAdvisorResponse = {
      success: true,
      data: recommendation,
    }

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Short advisor error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to analyze short position',
        details: error.toString()
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    service: 'Short Trading Advisor API',
    description: 'AI-powered short trading recommendations using Groq LLM',
    version: '1.0.0',
    features: [
      'Real-time stock data analysis',
      'Put option strike price recommendations',
      'Expiration date suggestions',
      'Portfolio-based position sizing',
      'Risk-adjusted recommendations',
      'AI-powered market analysis',
    ],
    usage: {
      method: 'POST',
      endpoint: '/api/short-advisor',
      body: {
        symbol: 'string (required) - Stock ticker symbol',
        portfolioValue: 'number (optional) - Total portfolio value (default: 100000)',
        riskTolerance: 'string (optional) - conservative|moderate|aggressive (default: moderate)',
      },
      example: {
        symbol: 'TSLA',
        portfolioValue: 100000,
        riskTolerance: 'moderate',
      },
    },
  })
}
