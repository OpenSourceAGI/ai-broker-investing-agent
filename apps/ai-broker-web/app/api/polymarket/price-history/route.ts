import { NextRequest, NextResponse } from 'next/server'
import { getPriceHistory, syncPriceHistory } from '@/packages/investing/src/prediction'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tokenId = searchParams.get('tokenId')
    const interval = searchParams.get('interval') || '1h'
    const sync = searchParams.get('sync') === 'true'

    if (!tokenId) {
      return NextResponse.json(
        {
          success: false,
          error: 'tokenId parameter is required',
        },
        { status: 400 }
      )
    }

    // If sync requested, fetch fresh data from API
    if (sync) {
      await syncPriceHistory(tokenId, { interval })
    }

    // Get price history from database
    const priceHistory = await getPriceHistory(tokenId, { interval })

    // Transform data for frontend
    const formattedHistory = priceHistory.map((point: any) => ({
      timestamp: point.timestamp,
      price: point.price,
    }))

    return NextResponse.json({
      success: true,
      data: formattedHistory,
      count: formattedHistory.length,
      tokenId,
      interval,
      source: sync ? 'api-sync' : 'database',
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Price history API error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch price history',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
