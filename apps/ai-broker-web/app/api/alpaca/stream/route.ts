import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createAlpacaClient } from '@/lib/alpaca/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/alpaca/stream
 * Get WebSocket connection details and authentication info for real-time market data
 *
 * Client-side usage:
 * 1. Call this endpoint to get connection credentials
 * 2. Use the returned websocket_url and credentials to connect via WebSocket
 * 3. Subscribe to trades, quotes, or bars for desired symbols
 *
 * Example WebSocket subscription message:
 * {
 *   "action": "subscribe",
 *   "trades": ["AAPL", "TSLA"],
 *   "quotes": ["AAPL"],
 *   "bars": ["TSLA"]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    const keyId = user?.alpacaKeyId || process.env.ALPACA_API_KEY || ''
    const secretKey = user?.alpacaSecretKey || process.env.ALPACA_SECRET || ''

    if (!keyId || !secretKey) {
      return NextResponse.json(
        { error: 'Alpaca API keys not configured' },
        { status: 400 }
      )
    }

    // Determine which data feed to use (IEX or SIP)
    // IEX is free, SIP requires subscription
    const feed = process.env.ALPACA_DATA_FEED || 'iex'
    const websocketUrl = `wss://stream.data.alpaca.markets/v2/${feed}`

    return NextResponse.json({
      success: true,
      connection: {
        websocket_url: websocketUrl,
        feed: feed,
        key_id: keyId,
        // Don't send the secret key in the response for security
        // Client should make authenticated connection directly
      },
      instructions: {
        auth_message: {
          action: 'auth',
          key: keyId,
          secret: '***', // Client must use their own secret
        },
        subscribe_example: {
          action: 'subscribe',
          trades: ['AAPL', 'TSLA'],
          quotes: ['AAPL'],
          bars: ['TSLA'],
        },
        unsubscribe_example: {
          action: 'unsubscribe',
          trades: ['AAPL'],
        },
      },
      supported_channels: {
        trades: 'Real-time trade data',
        quotes: 'Real-time bid/ask quotes',
        bars: 'Real-time minute bars',
        dailyBars: 'Real-time daily bars',
      },
    })
  } catch (error) {
    console.error('Error getting stream info:', error)
    return NextResponse.json(
      {
        error: 'Failed to get stream info',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/alpaca/stream/snapshot
 * Get latest real-time snapshot data for symbols (alternative to WebSocket for one-time queries)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { symbols } = body

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json(
        { error: 'symbols array is required' },
        { status: 400 }
      )
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    const keyId = user?.alpacaKeyId || process.env.ALPACA_API_KEY || ''
    const secretKey = user?.alpacaSecretKey || process.env.ALPACA_SECRET || ''

    if (!keyId || !secretKey) {
      return NextResponse.json(
        { error: 'Alpaca API keys not configured' },
        { status: 400 }
      )
    }

    // Use Alpaca Data API v2 for snapshots
    const feed = process.env.ALPACA_DATA_FEED || 'iex'
    const dataApiUrl = 'https://data.alpaca.markets'
    const symbolsParam = symbols.join(',')

    const response = await fetch(
      `${dataApiUrl}/v2/stocks/snapshots?symbols=${symbolsParam}&feed=${feed}`,
      {
        headers: {
          'APCA-API-KEY-ID': keyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: 'Failed to fetch snapshots', details: error },
        { status: response.status }
      )
    }

    const snapshots = await response.json()

    return NextResponse.json({
      success: true,
      snapshots,
    })
  } catch (error) {
    console.error('Error fetching snapshots:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch snapshots',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
