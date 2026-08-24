import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { and, like, ne, or } from "drizzle-orm"

// GET - Search users by name or email (for team invite autocomplete)
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get("q") || "").trim()

    if (query.length < 2) {
      return NextResponse.json({ success: true, data: [] })
    }

    const pattern = `%${query}%`
    const results = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(
        and(
          ne(users.id, session.user.id),
          or(like(users.name, pattern), like(users.email, pattern))
        )
      )
      .limit(10)

    return NextResponse.json({ success: true, data: results })
  } catch (error: any) {
    console.error("Error searching users:", error)
    return NextResponse.json(
      { error: error.message || "Failed to search users" },
      { status: 500 }
    )
  }
}
