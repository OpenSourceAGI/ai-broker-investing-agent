import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { strategies } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { auth } from "@/lib/auth"

const TEXT_FIELDS = ["name", "type", "status", "riskLevel"] as const
const METRIC_FIELDS = [
  "todayPnL",
  "last7DaysPnL",
  "last30DaysPnL",
  "winRate",
  "activeMarkets",
  "tradesToday",
] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const paramsValue = await params
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    // Allow-list the writable columns. Spreading the raw body let a caller
    // overwrite id, userId, createdAt or any other column.
    const changes: Record<string, unknown> = {}
    for (const field of TEXT_FIELDS) {
      const value = body[field]
      if (typeof value === "string" && value) changes[field] = value
    }
    for (const field of METRIC_FIELDS) {
      const value = body[field]
      if (typeof value === "number" && Number.isFinite(value)) changes[field] = value
    }
    if (body.config) changes.config = JSON.stringify(body.config)

    const updated = await db
      .update(strategies)
      .set({ ...changes, updatedAt: new Date() })
      .where(
        and(
          eq(strategies.id, paramsValue.id),
          eq(strategies.userId, session.user.id)
        )
      )
      .returning()

    if (updated.length === 0) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 })
    }

    return NextResponse.json(updated[0])
  } catch (error) {
    console.error("Error updating strategy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const paramsValue = await params
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const deleted = await db
      .delete(strategies)
      .where(
        and(
          eq(strategies.id, paramsValue.id),
          eq(strategies.userId, session.user.id)
        )
      )
      .returning()

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Strategy not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting strategy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
