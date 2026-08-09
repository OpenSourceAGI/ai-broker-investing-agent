import { NextRequest, NextResponse } from 'next/server'
import { syncAllMarkets } from '@/packages/investing/src/prediction'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const maxMarkets = body.maxMarkets !== undefined ? body.maxMarkets : 0 // Default to 0 (unlimited)
    const syncPriceHistory = body.syncPriceHistory !== false // Default to true

    const maxMarketsMsg = maxMarkets === 0 ? 'ALL' : maxMarkets
    console.log(`Starting sync of all markets (max: ${maxMarketsMsg}, price history: ${syncPriceHistory})...`)
    const startTime = Date.now()

    const result = await syncAllMarkets(maxMarkets, syncPriceHistory)

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    const message = syncPriceHistory
      ? `Successfully synced ${result.markets} markets with ${result.pricePoints} price data points in ${duration}s`
      : `Successfully synced ${result.markets} markets in ${duration}s`

    console.log(message)

    return NextResponse.json({
      success: true,
      markets: result.markets,
      pricePoints: result.pricePoints || 0,
      duration: `${duration}s`,
      message,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Polymarket sync all error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync all markets',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
