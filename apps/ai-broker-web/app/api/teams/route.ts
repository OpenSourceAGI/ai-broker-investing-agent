import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { teams, teamMembers, organizations, organizationMembers } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"

// GET - List teams the current user belongs to (via organization membership),
// with nested members and their user info.
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const memberships = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, session.user.id))

    if (memberships.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    const orgIds = memberships.map((m) => m.organizationId)

    const userTeams = await db.query.teams.findMany({
      where: inArray(teams.organizationId, orgIds),
      with: {
        members: {
          with: {
            user: {
              columns: { id: true, name: true, email: true, image: true },
            },
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: userTeams,
    })
  } catch (error: any) {
    console.error("Error fetching teams:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch teams" },
      { status: 500 }
    )
  }
}

// POST - Create new team. If organizationId is omitted, the caller's personal
// organization is used (created on first use).
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    let { organizationId, name, description, upgradeMembers } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    if (!organizationId) {
      const ownedOrg = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, session.user.id),
            eq(organizationMembers.role, "owner")
          )
        )
        .limit(1)

      if (ownedOrg.length > 0) {
        organizationId = ownedOrg[0].organizationId
      } else {
        const now = new Date()
        organizationId = crypto.randomUUID()
        await db.insert(organizations).values({
          id: organizationId,
          name: session.user.name ? `${session.user.name}'s Organization` : "My Organization",
          ownerId: session.user.id,
          createdAt: now,
          updatedAt: now,
        })
        await db.insert(organizationMembers).values({
          id: crypto.randomUUID(),
          organizationId,
          userId: session.user.id,
          role: "owner",
          joinedAt: now,
        })
      }
    }

    // Check if user is a member of the organization
    const membership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0 || !["owner", "admin"].includes(membership[0].role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const teamId = crypto.randomUUID()
    const now = new Date()

    const newTeam = {
      id: teamId,
      organizationId,
      name,
      description: description || null,
      upgradeMembers: !!upgradeMembers,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(teams).values(newTeam)

    // Add creator as team lead
    await db.insert(teamMembers).values({
      id: crypto.randomUUID(),
      teamId,
      userId: session.user.id,
      role: "lead",
      joinedAt: now,
    })

    return NextResponse.json({
      success: true,
      data: newTeam,
    })
  } catch (error: any) {
    console.error("Error creating team:", error)
    return NextResponse.json(
      { error: error.message || "Failed to create team" },
      { status: 500 }
    )
  }
}
