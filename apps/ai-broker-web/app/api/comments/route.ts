import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { comments, users, notifications } from "@/lib/db/schema"
import { eq, and, desc, isNull } from "drizzle-orm"

// GET - Fetch comments for an item
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const itemType = searchParams.get("itemType")
    const itemId = searchParams.get("itemId")

    if (!itemType || !itemId) {
      return NextResponse.json(
        { error: "itemType and itemId are required" },
        { status: 400 }
      )
    }

    // Get all comments with user info
    const itemComments = await db
      .select({
        id: comments.id,
        userId: comments.userId,
        content: comments.content,
        parentCommentId: comments.parentCommentId,
        editedAt: comments.editedAt,
        createdAt: comments.createdAt,
        userName: users.name,
        userImage: users.image,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(
        and(
          eq(comments.itemType, itemType),
          eq(comments.itemId, itemId)
        )
      )
      .orderBy(desc(comments.createdAt))

    // Organize comments into a tree structure (parent-child)
    const commentsMap = new Map()
    const rootComments: any[] = []

    itemComments.forEach((comment) => {
      commentsMap.set(comment.id, { ...comment, replies: [] })
    })

    itemComments.forEach((comment) => {
      if (comment.parentCommentId) {
        const parent = commentsMap.get(comment.parentCommentId)
        if (parent) {
          parent.replies.push(commentsMap.get(comment.id))
        }
      } else {
        rootComments.push(commentsMap.get(comment.id))
      }
    })

    return NextResponse.json({
      success: true,
      data: rootComments,
      total: itemComments.length,
    })
  } catch (error: any) {
    console.error("Error fetching comments:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch comments" },
      { status: 500 }
    )
  }
}

// POST - Add a comment
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { itemType, itemId, content, parentCommentId } = body

    if (!itemType || !itemId || !content) {
      return NextResponse.json(
        { error: "itemType, itemId, and content are required" },
        { status: 400 }
      )
    }

    // Validate itemType
    const validTypes = ["debate_report", "news_tip", "signal", "strategy"]
    if (!validTypes.includes(itemType)) {
      return NextResponse.json({ error: "Invalid item type" }, { status: 400 })
    }

    const now = new Date()

    const newComment = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      itemType,
      itemId,
      parentCommentId: parentCommentId || null,
      content,
      createdAt: now,
      updatedAt: now,
    }

    await db.insert(comments).values(newComment)

    // If it's a reply, notify the parent comment author
    if (parentCommentId) {
      const parentComment = await db
        .select()
        .from(comments)
        .where(eq(comments.id, parentCommentId))
        .limit(1)

      if (parentComment.length > 0 && parentComment[0].userId !== session.user.id) {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          userId: parentComment[0].userId,
          type: "comment",
          title: "New reply to your comment",
          message: `${session.user.name} replied to your comment`,
          fromUserId: session.user.id,
          relatedItemType: itemType,
          relatedItemId: itemId,
          read: false,
          createdAt: now,
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...newComment,
        userName: session.user.name,
        userImage: session.user.image,
      },
    })
  } catch (error: any) {
    console.error("Error adding comment:", error)
    return NextResponse.json(
      { error: error.message || "Failed to add comment" },
      { status: 500 }
    )
  }
}

// PATCH - Update a comment
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { commentId, content } = body

    if (!commentId || !content) {
      return NextResponse.json(
        { error: "commentId and content are required" },
        { status: 400 }
      )
    }

    // Verify comment ownership
    const comment = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1)

    if (comment.length === 0) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 })
    }

    if (comment[0].userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await db
      .update(comments)
      .set({
        content,
        editedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(comments.id, commentId))

    return NextResponse.json({
      success: true,
      message: "Comment updated",
    })
  } catch (error: any) {
    console.error("Error updating comment:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update comment" },
      { status: 500 }
    )
  }
}

// DELETE - Delete a comment
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const commentId = searchParams.get("commentId")

    if (!commentId) {
      return NextResponse.json(
        { error: "commentId is required" },
        { status: 400 }
      )
    }

    // Verify comment ownership
    const comment = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1)

    if (comment.length === 0) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 })
    }

    if (comment[0].userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Delete comment and its replies (cascade)
    await db.delete(comments).where(eq(comments.id, commentId))

    return NextResponse.json({
      success: true,
      message: "Comment deleted",
    })
  } catch (error: any) {
    console.error("Error deleting comment:", error)
    return NextResponse.json(
      { error: error.message || "Failed to delete comment" },
      { status: 500 }
    )
  }
}
