import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { watchlist } from "@/lib/db/schema"
import { eq, and, isNull } from "drizzle-orm"

// GET - Fetch user's watchlist items
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const listId = searchParams.get("listId")

    let query = db
      .select()
      .from(watchlist)
      .where(
        and(
          eq(watchlist.userId, session.user.id),
          listId ? eq(watchlist.watchlistId, listId) : isNull(watchlist.watchlistId)
        )
      )
      .orderBy(watchlist.addedAt)

    const userWatchlist = await query

    return NextResponse.json({
      success: true,
      data: userWatchlist,
    })
  } catch (error: any) {
    console.error("Error fetching watchlist:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch watchlist" },
      { status: 500 }
    )
  }
}

// POST - Add symbol to watchlist
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { symbol, name, listId } = body

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 })
    }

    // Check if symbol already exists in watchlist
    const existing = await db
      .select()
      .from(watchlist)
      .where(
        and(
          eq(watchlist.userId, session.user.id),
          eq(watchlist.symbol, symbol.toUpperCase()),
          listId ? eq(watchlist.watchlistId, listId) : isNull(watchlist.watchlistId)
        )
      )
      .limit(1)

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Symbol already in watchlist" },
        { status: 400 }
      )
    }

    // Add to watchlist
    const newItem = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      watchlistId: listId || null,
      symbol: symbol.toUpperCase(),
      name: name || null,
      addedAt: new Date(),
    }

    await db.insert(watchlist).values(newItem)

    return NextResponse.json({
      success: true,
      data: newItem,
    })
  } catch (error: any) {
    console.error("Error adding to watchlist:", error)
    return NextResponse.json(
      { error: error.message || "Failed to add to watchlist" },
      { status: 500 }
    )
  }
}

// DELETE - Remove symbol from watchlist
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get("symbol")
    const listId = searchParams.get("listId")

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 })
    }

    await db
      .delete(watchlist)
      .where(
        and(
          eq(watchlist.userId, session.user.id),
          eq(watchlist.symbol, symbol.toUpperCase()),
          listId ? eq(watchlist.watchlistId, listId) : isNull(watchlist.watchlistId)
        )
      )

    return NextResponse.json({
      success: true,
      message: "Symbol removed from watchlist",
    })
  } catch (error: any) {
    console.error("Error removing from watchlist:", error)
    return NextResponse.json(
      { error: error.message || "Failed to remove from watchlist" },
      { status: 500 }
    )
  }
}
