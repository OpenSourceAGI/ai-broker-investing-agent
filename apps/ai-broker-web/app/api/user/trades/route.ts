import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { trades, portfolios, positions } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

// POST - Execute a trade
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { symbol, action, shares, price } = body

    if (!symbol || !action || !shares || !price) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (action !== "buy" && action !== "short" && action !== "sell") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    if (shares <= 0) {
      return NextResponse.json({ error: "Invalid share amount" }, { status: 400 })
    }

    const totalCost = shares * price

    // Get user's portfolio
    const userPortfolio = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, session.user.id))
      .limit(1)

    if (userPortfolio.length === 0) {
      return NextResponse.json(
        { error: "Portfolio not found" },
        { status: 404 }
      )
    }

    const portfolio = userPortfolio[0]

    // Check if user has enough cash for buy orders
    if (action === "buy" && portfolio.cash < totalCost) {
      return NextResponse.json(
        { error: "Insufficient funds" },
        { status: 400 }
      )
    }

    // Create trade record
    const tradeId = crypto.randomUUID()
    await db.insert(trades).values({
      id: tradeId,
      userId: session.user.id,
      asset: symbol.toUpperCase(),
      type: "stock",
      action,
      price,
      size: shares,
      pnl: null,
      strategy: "manual",
      copiedFrom: null,
      timestamp: new Date(),
      createdAt: new Date(),
    })

    // Update portfolio cash
    const newCash = action === "buy"
      ? portfolio.cash - totalCost
      : portfolio.cash + totalCost

    await db
      .update(portfolios)
      .set({
        cash: newCash,
        updatedAt: new Date(),
      })
      .where(eq(portfolios.userId, session.user.id))

    // Update or create position
    const existingPosition = await db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.userId, session.user.id),
          eq(positions.asset, symbol.toUpperCase()),
          eq(positions.closedAt, null as any) // Open positions only
        )
      )
      .limit(1)

    if (existingPosition.length > 0) {
      // Update existing position
      const position = existingPosition[0]
      const newSize = action === "buy"
        ? position.size + shares
        : position.size - shares

      const newAvgPrice = ((position.entryPrice * position.size) + (price * shares)) / (position.size + shares)

      await db
        .update(positions)
        .set({
          size: newSize,
          entryPrice: newAvgPrice,
          currentPrice: price,
          updatedAt: new Date(),
        })
        .where(eq(positions.id, position.id))
    } else {
      // Create new position
      const positionId = crypto.randomUUID()
      await db.insert(positions).values({
        id: positionId,
        userId: session.user.id,
        asset: symbol.toUpperCase(),
        type: "stock",
        entryPrice: price,
        currentPrice: price,
        size: action === "buy" ? shares : -shares, // Negative for short positions
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        strategy: "manual",
        openedBy: "user",
        openedAt: new Date(),
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        tradeId,
        symbol: symbol.toUpperCase(),
        action,
        shares,
        price,
        total: totalCost,
      },
    })
  } catch (error: any) {
    console.error("Error executing trade:", error)
    return NextResponse.json(
      { error: error.message || "Failed to execute trade" },
      { status: 500 }
    )
  }
}

// GET - Fetch user's trade history
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userTrades = await db
      .select()
      .from(trades)
      .where(eq(trades.userId, session.user.id))
      .orderBy(trades.timestamp)

    return NextResponse.json({
      success: true,
      data: userTrades,
    })
  } catch (error: any) {
    console.error("Error fetching trades:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch trades" },
      { status: 500 }
    )
  }
}
