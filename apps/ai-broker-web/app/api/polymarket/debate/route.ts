import { NextRequest, NextResponse } from 'next/server'
import { getMarketDebate, saveDebate, getMarkets } from '@/packages/investing/src/prediction'
import { generateDebateAnalysis } from '@/packages/investing/src/llm/debate-generator'

export const dynamic = 'force-dynamic'

// GET /api/polymarket/debate?marketId=xyz
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const marketId = searchParams.get('marketId')

    if (!marketId) {
      return NextResponse.json(
        { success: false, error: 'marketId is required' },
        { status: 400 }
      )
    }

    const debate = await getMarketDebate(marketId)

    if (!debate) {
      return NextResponse.json(
        { success: false, error: 'No debate found for this market' },
        { status: 404 }
      )
    }

    // Parse JSON fields
    const response = {
      ...debate,
      yesArguments: JSON.parse(debate.yesArguments as string),
      noArguments: JSON.parse(debate.noArguments as string),
      keyFactors: JSON.parse(debate.keyFactors as string),
      uncertainties: JSON.parse(debate.uncertainties as string),
    }

    return NextResponse.json({
      success: true,
      debate: response,
    })
  } catch (error) {
    console.error('Error fetching debate:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch debate' },
      { status: 500 }
    )
  }
}

// POST /api/polymarket/debate
// Body: { marketId: string, apiKey?: string }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { marketId, apiKey } = body

    if (!marketId) {
      return NextResponse.json(
        { success: false, error: 'marketId is required' },
        { status: 400 }
      )
    }

    // Fetch market data
    const markets = await getMarkets({ limit: 1000 })
    const market = markets.find((m: any) => m.id === marketId)

    if (!market) {
      return NextResponse.json(
        { success: false, error: 'Market not found' },
        { status: 404 }
      )
    }

    // Parse market data
    const outcomes = (market.outcomes)
    const outcomePrices = market.outcomePrices;
    const tags = market.tags;

    const yesIndex = outcomes.indexOf('yes')
    const noIndex = outcomes.indexOf('no')

    const currentYesPrice = yesIndex >= 0 ? parseFloat(outcomePrices[yesIndex]) : 0.5
    const currentNoPrice = noIndex >= 0 ? parseFloat(outcomePrices[noIndex]) : 0.5

    // Generate debate analysis using LLM
    const analysis = await generateDebateAnalysis(
      {
        question: market.question,
        description: market.description || undefined,
        currentYesPrice,
        currentNoPrice,
        volume24hr: market.volume24hr || undefined,
        volumeTotal: market.volumeTotal || undefined,
        tags,
      },
      apiKey
    )

    // Save to database
    await saveDebate(marketId, {
      question: market.question,
      yesArguments: analysis.yesArguments,
      noArguments: analysis.noArguments,
      yesSummary: analysis.yesSummary,
      noSummary: analysis.noSummary,
      keyFactors: analysis.keyFactors,
      uncertainties: analysis.uncertainties,
      currentYesPrice,
      currentNoPrice,
      llmProvider: 'groq',
      model: 'llama-3.3-70b-versatile',
    })

    return NextResponse.json({
      success: true,
      debate: {
        marketId,
        question: market.question,
        ...analysis,
        currentYesPrice,
        currentNoPrice,
      },
    })
  } catch (error) {
    console.error('Error generating debate:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate debate'
      },
      { status: 500 }
    )
  }
}
