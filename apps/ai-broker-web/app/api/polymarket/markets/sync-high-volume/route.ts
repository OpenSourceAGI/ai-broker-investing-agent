import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAllMarkets,
  saveMarkets,
  syncPriceHistory
} from '@/packages/investing/src/prediction'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

/**
 * POST /api/polymarket/markets/sync-high-volume
 * Body: { minVolume?: number, interval?: string }
 *
 * Syncs all active markets with volume above the threshold (default: 100k)
 * and stores their historical price data.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const minVolume = body.minVolume || 100000 // Default to 100k
    const interval = body.interval || '1h' // Default to 1-hour intervals

    console.log(`Starting high-volume markets sync (min volume: $${minVolume.toLocaleString()})...`)
    const startTime = Date.now()

    // Fetch all active markets
    console.log('Fetching all active markets...')
    let allMarkets;
    try {
      allMarkets = await fetchAllMarkets('volume24hr', 0) // 0 = unlimited
    } catch (error: any) {
      console.error('Failed to fetch markets from Polymarket API:', error.message)
      throw new Error(`Failed to fetch markets: ${error.message}`)
    }

    // Filter markets by volume
    const highVolumeMarkets = allMarkets.filter((market: any) => {
      try {
        const volume = market.volume24hr || market.volumeNum || market.volumeTotal || 0
        return volume >= minVolume
      } catch (error: any) {
        console.error(`Error filtering market ${market?.id}:`, error.message)
        return false
      }
    })

    console.log(`Found ${highVolumeMarkets.length} markets with volume >= $${minVolume.toLocaleString()}`)

    if (highVolumeMarkets.length === 0) {
      return NextResponse.json({
        success: true,
        markets: 0,
        pricePoints: 0,
        message: 'No markets found matching the volume criteria',
        timestamp: new Date().toISOString()
      })
    }

    // Save high-volume markets to database
    try {
      await saveMarkets(highVolumeMarkets)
      console.log(`Saved ${highVolumeMarkets.length} high-volume markets to database`)
    } catch (error: any) {
      console.error('Failed to save markets to database:', error.message)
      throw new Error(`Failed to save markets: ${error.message}`)
    }

    // Fetch and save price history for each market
    let totalPricePoints = 0
    let successCount = 0
    let failCount = 0

    console.log('Fetching price history for markets...')
    for (let i = 0; i < highVolumeMarkets.length; i++) {
      const market = highVolumeMarkets[i]

      // Progress logging
      if ((i + 1) % 10 === 0 || i === 0 || i === highVolumeMarkets.length - 1) {
        console.log(`Progress: ${i + 1}/${highVolumeMarkets.length} markets processed`)
      }

      if (market.clobTokenIds && market.clobTokenIds.length > 0) {
        try {
          // Fetch history for the first token (typically "Yes" outcome)
          const tokenId = market.clobTokenIds[0]
          const result = await syncPriceHistory(tokenId, { interval })
          totalPricePoints += result.pricePoints
          successCount++
        } catch (error: any) {
          failCount++
          // Only log details for unexpected errors (not 400s which are common for invalid tokens)
          if (error.message?.includes('400') || error.message?.includes('Invalid token')) {
            console.log(`Skipping market ${market.id} - ${error.message}`)
          } else {
            console.error(`Failed to sync price history for market ${market.id} (${market.question}):`, error.message)
          }
        }
      } else {
        console.log(`Skipping market ${market.id} - no token IDs available`)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    const message = `Successfully synced ${highVolumeMarkets.length} markets with volume >= $${minVolume.toLocaleString()}. ` +
      `Saved ${totalPricePoints} price data points (${successCount} successful, ${failCount} failed) in ${duration}s`

    console.log(message)

    return NextResponse.json({
      success: true,
      markets: highVolumeMarkets.length,
      pricePoints: totalPricePoints,
      priceHistorySuccess: successCount,
      priceHistoryFailed: failCount,
      duration: `${duration}s`,
      minVolume,
      interval,
      message,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('High-volume markets sync error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to sync high-volume markets',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/polymarket/markets/sync-high-volume
 * Returns information about the endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/polymarket/markets/sync-high-volume',
    method: 'POST',
    description: 'Syncs all active markets with volume above a threshold and stores their historical price data',
    parameters: {
      minVolume: {
        type: 'number',
        default: 100000,
        description: 'Minimum 24h volume in USD to filter markets'
      },
      interval: {
        type: 'string',
        default: '1h',
        description: 'Time interval for price history data (e.g., "1h", "1d", "max")'
      }
    },
    example: {
      request: {
        minVolume: 100000,
        interval: '1h'
      }
    }
  })
}
