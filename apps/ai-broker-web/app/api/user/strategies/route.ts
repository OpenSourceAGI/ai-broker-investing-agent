import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { strategies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userStrategies = await db
      .select()
      .from(strategies)
      .where(eq(strategies.userId, session.user.id))

    return NextResponse.json(userStrategies)
  } catch (error) {
    console.error("Error fetching strategies:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, type, riskLevel, config } = body

    const newStrategy = await db
      .insert(strategies)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        name,
        type,
        riskLevel: riskLevel || "medium",
        status: "paused",
        config: config ? JSON.stringify(config) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    return NextResponse.json(newStrategy[0], { status: 201 })
  } catch (error) {
    console.error("Error creating strategy:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
