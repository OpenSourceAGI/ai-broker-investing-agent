import { NextRequest, NextResponse } from 'next/server'
import { syncMarketsIncremental } from '@/packages/investing/src/prediction'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * Cron job to sync top 1000 high volume Polymarket markets every 15 minutes
 * This keeps the database up to date with the most actively traded prediction markets
 * Uses incremental sync to update existing markets without deleting all data
 * Syncs market data, price history, and top holders
 */
export async function GET(request: NextRequest) {
  // Check for CRON_SECRET for automated cron jobs
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Allow access if valid CRON_SECRET is provided (for automated jobs)
  const isCronJob = cronSecret && authHeader === `Bearer ${cronSecret}`

  // Otherwise, require user authentication
  if (!isCronJob) {
    const session = await auth.api.getSession({
      headers: await headers()
    })

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    console.log('Starting cron job: Incrementally syncing top 1000 Polymarket markets...')
    const startTime = Date.now()

    // Incrementally sync top 1000 markets with price history and holders
    const result = await syncMarketsIncremental(1000, true, true)

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    const message = `Successfully synced ${result.markets} markets with ${result.pricePoints} price data points (${result.priceHistoryUpdates} markets updated) and ${result.holders} holders (${result.holderUpdates} markets updated) in ${duration}s`

    console.log(`Cron job completed: ${message}`)

    return NextResponse.json({
      success: true,
      markets: result.markets,
      pricePoints: result.pricePoints || 0,
      priceHistoryUpdates: result.priceHistoryUpdates || 0,
      holders: result.holders || 0,
      holderUpdates: result.holderUpdates || 0,
      duration: `${duration}s`,
      message,
      cronJob: true,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Polymarket markets cron sync error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Sync failed',
        cronJob: true,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
