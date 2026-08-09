import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { signals } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userSignals = await db
      .select()
      .from(signals)
      .where(eq(signals.userId, session.user.id))

    return NextResponse.json(userSignals)
  } catch (error) {
    console.error("Error fetching signals:", error)
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
    const {
      asset,
      type,
      combinedScore,
      scoreLabel,
      fundamentalsScore,
      vixScore,
      technicalScore,
      sentimentScore,
      strategy,
      timeframe,
      suggestedAction,
      suggestedSize,
      metadata,
    } = body

    const newSignal = await db
      .insert(signals)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        asset,
        type,
        combinedScore,
        scoreLabel,
        fundamentalsScore,
        vixScore,
        technicalScore,
        sentimentScore,
        strategy,
        timeframe,
        suggestedAction,
        suggestedSize,
        metadata: metadata ? JSON.stringify(metadata) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    return NextResponse.json(newSignal[0], { status: 201 })
  } catch (error) {
    console.error("Error creating signal:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
