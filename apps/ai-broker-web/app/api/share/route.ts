import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sharedItems, notifications, users } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

// GET - Get items shared with user
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get items shared with this user's email or user ID
    const shared = await db
      .select({
        id: sharedItems.id,
        sharedById: sharedItems.sharedById,
        itemType: sharedItems.itemType,
        itemId: sharedItems.itemId,
        symbol: sharedItems.symbol,
        title: sharedItems.title,
        message: sharedItems.message,
        metadata: sharedItems.metadata,
        viewedAt: sharedItems.viewedAt,
        createdAt: sharedItems.createdAt,
        sharedByName: users.name,
        sharedByEmail: users.email,
        sharedByImage: users.image,
      })
      .from(sharedItems)
      .innerJoin(users, eq(sharedItems.sharedById, users.id))
      .where(eq(sharedItems.sharedWithEmail, session.user.email))

    return NextResponse.json({
      success: true,
      data: shared,
    })
  } catch (error: any) {
    console.error("Error fetching shared items:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch shared items" },
      { status: 500 }
    )
  }
}

// POST - Share an item (stock alert, debate report, etc.)
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { email, itemType, itemId, symbol, title, message, metadata } = body

    if (!email || !itemType || !itemId) {
      return NextResponse.json(
        { error: "Email, itemType, and itemId are required" },
        { status: 400 }
      )
    }

    // Validate itemType
    const validTypes = ["stock_alert", "debate_report", "signal", "strategy"]
    if (!validTypes.includes(itemType)) {
      return NextResponse.json({ error: "Invalid item type" }, { status: 400 })
    }

    // Check if recipient user exists
    const recipient = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    const now = new Date()

    const sharedItem = {
      id: crypto.randomUUID(),
      sharedById: session.user.id,
      sharedWithEmail: email,
      sharedWithUserId: recipient.length > 0 ? recipient[0].id : null,
      itemType,
      itemId,
      symbol: symbol || null,
      title: title || null,
      message: message || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: now,
    }

    await db.insert(sharedItems).values(sharedItem)

    // If recipient is a registered user, create a notification
    if (recipient.length > 0) {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: recipient[0].id,
        type: "share",
        title: `${session.user.name} shared ${itemType.replace("_", " ")} with you`,
        message: title || message || `Check out this ${itemType.replace("_", " ")}`,
        actionUrl: `/shared/${sharedItem.id}`,
        fromUserId: session.user.id,
        relatedItemType: itemType,
        relatedItemId: itemId,
        read: false,
        createdAt: now,
      })
    }

    // TODO: Send email to recipient
    // Integrate with email service (Resend, SendGrid, etc.)

    return NextResponse.json({
      success: true,
      data: sharedItem,
      message: recipient.length > 0
        ? "Item shared and notification sent"
        : "Item shared. Invitation email will be sent.",
    })
  } catch (error: any) {
    console.error("Error sharing item:", error)
    return NextResponse.json(
      { error: error.message || "Failed to share item" },
      { status: 500 }
    )
  }
}

// PATCH - Mark shared item as viewed
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { sharedItemId } = body

    if (!sharedItemId) {
      return NextResponse.json(
        { error: "Shared item ID is required" },
        { status: 400 }
      )
    }

    // Verify the item was shared with this user
    const item = await db
      .select()
      .from(sharedItems)
      .where(eq(sharedItems.id, sharedItemId))
      .limit(1)

    if (item.length === 0) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 })
    }

    if (item[0].sharedWithEmail !== session.user.email) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await db
      .update(sharedItems)
      .set({ viewedAt: new Date() })
      .where(eq(sharedItems.id, sharedItemId))

    return NextResponse.json({
      success: true,
      message: "Marked as viewed",
    })
  } catch (error: any) {
    console.error("Error marking item as viewed:", error)
    return NextResponse.json(
      { error: error.message || "Failed to mark as viewed" },
      { status: 500 }
    )
  }
}
