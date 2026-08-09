import { NextRequest, NextResponse } from 'next/server'
import { syncMarketsIncremental, syncLeadersAndCategories } from '@/packages/investing/src/prediction'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * Cron job to sync Polymarket data every 5 minutes
 * Performs a lightweight market sync (no price history or holders)
 * and syncs leaders and categories
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
    console.log('Starting cron job: Syncing Polymarket markets (lightweight)...')
    const startTime = Date.now()

    // Lightweight sync: markets only (no price history or holders)
    const marketsResult = await syncMarketsIncremental(1000, false, false)

    // Also sync leaders and categories
    const leadersResult = await syncLeadersAndCategories()

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    const message = `Synced ${marketsResult.markets} markets and leaders/categories in ${duration}s`

    console.log(`Cron job completed: ${message}`)

    return NextResponse.json({
      success: true,
      markets: marketsResult.markets,
      leaders: leadersResult,
      duration: `${duration}s`,
      message,
      cronJob: true,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Polymarket sync error:', error)
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
