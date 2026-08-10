import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { strategies } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { auth } from "@/lib/auth"

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
    const { name, type, status, riskLevel, config, ...metrics } = body

    const updated = await db
      .update(strategies)
      .set({
        ...(name && { name }),
        ...(type && { type }),
        ...(status && { status }),
        ...(riskLevel && { riskLevel }),
        ...(config && { config: JSON.stringify(config) }),
        ...metrics,
        updatedAt: new Date(),
      })
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
