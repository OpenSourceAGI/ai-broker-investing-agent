import { NextRequest, NextResponse } from 'next/server'
import { getQuotes } from '@/packages/investing/src/stocks/unified-quote-service'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

/**
 * Cron job to refresh stock quotes every 5 minutes
 * Keeps cache fresh for popular stocks
 */

// Popular stocks to refresh (top traded stocks)
const POPULAR_SYMBOLS = [
  // Tech Giants
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  // Major Indices ETFs
  'SPY', 'QQQ', 'DIA', 'IWM',
  // Financial
  'JPM', 'BAC', 'WFC', 'GS', 'MS',
  // Other Popular
  'NFLX', 'AMD', 'INTC', 'BABA', 'DIS',
  'COIN', 'SQ', 'PYPL', 'V', 'MA',
  // Energy
  'XOM', 'CVX',
  // Healthcare
  'JNJ', 'PFE', 'UNH',
  // Consumer
  'WMT', 'HD', 'MCD', 'NKE',
]

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
    console.log(`Starting cron job: Refreshing quotes for ${POPULAR_SYMBOLS.length} popular stocks...`)
    const startTime = Date.now()

    // Fetch fresh quotes (bypass cache)
    const result = await getQuotes(POPULAR_SYMBOLS, {
      useCache: false  // Force fresh fetch to update cache
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    if (!result.success || !result.data) {
      console.error('Quote refresh failed:', result.error)
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to refresh quotes',
        cronJob: true,
        timestamp: new Date().toISOString()
      }, { status: 500 })
    }

    const successCount = result.data.quotes.length
    const message = `Successfully refreshed ${successCount}/${POPULAR_SYMBOLS.length} stock quotes in ${duration}s`

    console.log(`Cron job completed: ${message}`)

    return NextResponse.json({
      success: true,
      refreshed: successCount,
      total: POPULAR_SYMBOLS.length,
      symbols: POPULAR_SYMBOLS,
      duration: `${duration}s`,
      message,
      sources: result.data.source,
      cronJob: true,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Quote refresh cron error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Quote refresh failed',
        cronJob: true,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
