import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createAlpacaClient } from '@/lib/alpaca/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || '1M'
    const timeframe = searchParams.get('timeframe') || '1D'

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    if (!user?.alpacaKeyId || !user?.alpacaSecretKey) {
      return NextResponse.json({ error: 'Alpaca API keys not configured' }, { status: 400 })
    }

    const alpaca = createAlpacaClient({
      keyId: user.alpacaKeyId,
      secretKey: user.alpacaSecretKey,
      paper: user.alpacaPaper ?? true,
    })

    const history = await alpaca.getPortfolioHistory({
      period: period as '1M' | '3M' | '6M' | '1A' | 'all' | 'intraday',
      timeframe: timeframe as '1Min' | '5Min' | '15Min' | '1H' | '1D',
    })

    return NextResponse.json({ success: true, history })
  } catch (error) {
    console.error('Error fetching portfolio history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch portfolio history', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
