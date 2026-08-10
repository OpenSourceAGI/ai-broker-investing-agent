import { NextRequest, NextResponse } from 'next/server'
import { fetchMarketSummary } from '@/packages/investing/src/prediction'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Required parameter
    const { eventId } = body
    if (!eventId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Parameter "eventId" is required in request body',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // Fetch market summary from Polymarket Analytics API
    const result = await fetchMarketSummary(eventId)

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Market summary API error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch market summary',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
