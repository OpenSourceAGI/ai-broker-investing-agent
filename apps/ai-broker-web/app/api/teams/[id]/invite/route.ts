import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  teams,
  teamMembers,
  organizations,
  organizationMembers,
  users,
  userInvitations,
  notifications,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { sendEmail, renderEmailLayout, renderEmailButton } from "@/lib/email/send-email"

// POST - Invite a user (by email) to a team. Adds existing users directly;
// emails a signup invitation (via Cloudflare Email Workers) to everyone else.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const teamId = params.id
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const team = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1)
    if (team.length === 0) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 })
    }

    const orgMembership = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, team[0].organizationId),
          eq(organizationMembers.userId, session.user.id)
        )
      )
      .limit(1)

    const teamMembership = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(teamMembers.userId, session.user.id)
        )
      )
      .limit(1)

    const isOrgAdmin = orgMembership.length > 0 && ["owner", "admin"].includes(orgMembership[0].role)
    const isTeamLead = teamMembership.length > 0 && teamMembership[0].role === "lead"

    if (!isOrgAdmin && !isTeamLead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, team[0].organizationId))
      .limit(1)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://autoinvestment.broker"
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1)

    if (existingUser.length > 0) {
      const userId = existingUser[0].id

      if (userId === session.user.id) {
        return NextResponse.json({ error: "Cannot invite yourself" }, { status: 400 })
      }

      const alreadyInTeam = await db
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .limit(1)

      if (alreadyInTeam.length > 0) {
        return NextResponse.json({ error: "User is already a team member" }, { status: 400 })
      }

      const alreadyInOrg = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, team[0].organizationId),
            eq(organizationMembers.userId, userId)
          )
        )
        .limit(1)

      if (alreadyInOrg.length === 0) {
        await db.insert(organizationMembers).values({
          id: crypto.randomUUID(),
          organizationId: team[0].organizationId,
          userId,
          role: "member",
          joinedAt: new Date(),
        })
      }

      await db.insert(teamMembers).values({
        id: crypto.randomUUID(),
        teamId,
        userId,
        role: "member",
        joinedAt: new Date(),
      })

      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId,
        type: "invite",
        title: "Added to a team",
        message: `${session.user.name} added you to ${team[0].name}`,
        fromUserId: session.user.id,
        relatedItemType: "team",
        relatedItemId: teamId,
        read: false,
        createdAt: new Date(),
      })

      await sendEmail({
        to: email,
        subject: `You've been added to ${team[0].name}`,
        html: renderEmailLayout(
          "You're on the team!",
          `<p>${session.user.name} added you to the <strong>${team[0].name}</strong> team${org.length ? ` in ${org[0].name}` : ""}.</p>${renderEmailButton("Go to Dashboard", `${appUrl}/dashboard`)}`
        ),
      })

      return NextResponse.json({ success: true, invited: false, message: "Member added" })
    }

    // No account with this email yet -- create a pending invitation and email it.
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const invitationId = crypto.randomUUID()

    await db.insert(userInvitations).values({
      id: invitationId,
      inviterId: session.user.id,
      email,
      status: "pending",
      organizationId: team[0].organizationId,
      teamId,
      expiresAt,
      createdAt: now,
    })

    const acceptUrl = `${appUrl}/sign-up?invite=${invitationId}`
    await sendEmail({
      to: email,
      subject: `${session.user.name} invited you to join ${team[0].name}`,
      html: renderEmailLayout(
        "You've been invited",
        `<p>${session.user.name} invited you to join the <strong>${team[0].name}</strong> team.</p>${renderEmailButton("Accept Invitation", acceptUrl)}<p style="color:#888;font-size:12px;">This invitation expires in 7 days.</p>`
      ),
    })

    return NextResponse.json({ success: true, invited: true, message: "Invitation email sent" })
  } catch (error: any) {
    console.error("Error inviting team member:", error)
    return NextResponse.json(
      { error: error.message || "Failed to invite member" },
      { status: 500 }
    )
  }
}
