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
    const status = searchParams.get('status') || 'all'
    const limit = parseInt(searchParams.get('limit') || '50')

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    if (!user?.alpacaKeyId || !user?.alpacaSecretKey) {
      return NextResponse.json({ error: 'Alpaca API keys not configured' }, { status: 400 })
    }

    const alpaca = createAlpacaClient({
      keyId: user.alpacaKeyId,
      secretKey: user.alpacaSecretKey,
      paper: user.alpacaPaper ?? true,
    })

    const orders = await alpaca.getOrders({
      status: status || 'open',
      limit: limit || 50,
      direction: 'desc',
    } as any)

    return NextResponse.json({ success: true, orders })
  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders', details: error instanceof Error ? error.message : 'Unknown error' },
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
    const {
      symbol,
      qty,
      notional,
      side,
      type,
      time_in_force,
      limit_price,
      stop_price,
      trail_price,
      trail_percent,
      extended_hours,
      client_order_id,
      order_class,
      take_profit,
      stop_loss,
    } = body

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    if (!user?.alpacaKeyId || !user?.alpacaSecretKey) {
      return NextResponse.json({ error: 'Alpaca API keys not configured' }, { status: 400 })
    }

    const alpaca = createAlpacaClient({
      keyId: user.alpacaKeyId,
      secretKey: user.alpacaSecretKey,
      paper: user.alpacaPaper ?? true,
    })

    const order = await alpaca.createOrder({
      symbol,
      qty,
      notional,
      side,
      type,
      time_in_force: time_in_force || 'day',
      limit_price,
      stop_price,
      trail_price,
      trail_percent,
      extended_hours,
      client_order_id,
      order_class,
      take_profit,
      stop_loss,
    })

    return NextResponse.json({ success: true, order })
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { error: 'Failed to create order', details: error instanceof Error ? error.message : 'Unknown error' },
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
    const orderId = searchParams.get('id')

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1)

    if (!user?.alpacaKeyId || !user?.alpacaSecretKey) {
      return NextResponse.json({ error: 'Alpaca API keys not configured' }, { status: 400 })
    }

    const alpaca = createAlpacaClient({
      keyId: user.alpacaKeyId,
      secretKey: user.alpacaSecretKey,
      paper: user.alpacaPaper ?? true,
    })

    if (orderId) {
      // Cancel specific order
      await alpaca.cancelOrder(orderId)
      return NextResponse.json({ success: true, message: `Order ${orderId} cancelled` })
    } else {
      // Cancel all orders
      await alpaca.cancelAllOrders()
      return NextResponse.json({ success: true, message: 'All orders cancelled' })
    }
  } catch (error) {
    console.error('Error cancelling order:', error)
    return NextResponse.json(
      { error: 'Failed to cancel order', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
