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
    const symbol = searchParams.get('symbol')
    const status = searchParams.get('status') || 'active'

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    if (!user?.alpacaKeyId || !user?.alpacaSecretKey) {
      return NextResponse.json({ error: 'Alpaca API keys not configured' }, { status: 400 })
    }

    const alpaca = createAlpacaClient({
      keyId: user.alpacaKeyId,
      secretKey: user.alpacaSecretKey,
      paper: user.alpacaPaper ?? true,
    })

    if (symbol) {
      const asset = await alpaca.getAsset(symbol)
      return NextResponse.json({ success: true, asset })
    } else {
      const assets = await alpaca.getAssets({
        status: status as 'active' | 'inactive',
      })
      return NextResponse.json({ success: true, assets })
    }
  } catch (error) {
    console.error('Error fetching assets:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assets', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
