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
    const watchlistId = searchParams.get('id')

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    if (!user?.alpacaKeyId || !user?.alpacaSecretKey) {
      return NextResponse.json({ error: 'Alpaca API keys not configured' }, { status: 400 })
    }

    const alpaca = createAlpacaClient({
      keyId: user.alpacaKeyId,
      secretKey: user.alpacaSecretKey,
      paper: user.alpacaPaper ?? true,
    })

    if (watchlistId) {
      const watchlist = await alpaca.getWatchlist(watchlistId)
      return NextResponse.json({ success: true, watchlist })
    } else {
      const watchlists = await alpaca.getWatchlists()
      return NextResponse.json({ success: true, watchlists })
    }
  } catch (error) {
    console.error('Error fetching watchlists:', error)
    return NextResponse.json(
      { error: 'Failed to fetch watchlists', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, symbols } = body

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    if (!user?.alpacaKeyId || !user?.alpacaSecretKey) {
      return NextResponse.json({ error: 'Alpaca API keys not configured' }, { status: 400 })
    }

    const alpaca = createAlpacaClient({
      keyId: user.alpacaKeyId,
      secretKey: user.alpacaSecretKey,
      paper: user.alpacaPaper ?? true,
    })

    const watchlist = await alpaca.addWatchlist(name, symbols || [])

    return NextResponse.json({ success: true, watchlist })
  } catch (error) {
    console.error('Error creating watchlist:', error)
    return NextResponse.json(
      { error: 'Failed to create watchlist', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, name, symbols, addSymbol } = body

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    if (!user?.alpacaKeyId || !user?.alpacaSecretKey) {
      return NextResponse.json({ error: 'Alpaca API keys not configured' }, { status: 400 })
    }

    const alpaca = createAlpacaClient({
      keyId: user.alpacaKeyId,
      secretKey: user.alpacaSecretKey,
      paper: user.alpacaPaper ?? true,
    })

    if (addSymbol) {
      const watchlist = await alpaca.addToWatchlist(id, addSymbol)
      return NextResponse.json({ success: true, watchlist })
    } else {
      const watchlist = await alpaca.updateWatchlist(name, symbols)
      return NextResponse.json({ success: true, watchlist })
    }
  } catch (error) {
    console.error('Error updating watchlist:', error)
    return NextResponse.json(
      { error: 'Failed to update watchlist', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const symbol = searchParams.get('symbol')

    if (!id) {
      return NextResponse.json({ error: 'Watchlist ID required' }, { status: 400 })
    }

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
      // Remove symbol from watchlist
      await alpaca.deleteFromWatchlist(id, symbol)
      return NextResponse.json({ success: true, message: `Symbol ${symbol} removed from watchlist` })
    } else {
      // Delete entire watchlist
      await alpaca.deleteWatchlist(id)
      return NextResponse.json({ success: true, message: 'Watchlist deleted' })
    }
  } catch (error) {
    console.error('Error deleting watchlist:', error)
    return NextResponse.json(
      { error: 'Failed to delete watchlist', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
