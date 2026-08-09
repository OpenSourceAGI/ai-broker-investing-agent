import { NextRequest, NextResponse } from 'next/server'
import { fetchMarketsDashboard } from '@/packages/investing/src/prediction'

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

    // Fetch dashboard data from Polymarket Analytics API
    const result = await fetchMarketsDashboard(eventId)

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Markets dashboard API error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch markets dashboard',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
