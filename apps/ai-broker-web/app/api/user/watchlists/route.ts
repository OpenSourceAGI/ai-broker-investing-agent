import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { watchlists, watchlist } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

// GET - Fetch user's watchlists
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userWatchlists = await db
      .select()
      .from(watchlists)
      .where(eq(watchlists.userId, session.user.id))
      .orderBy(watchlists.createdAt);

    return NextResponse.json({
      success: true,
      data: userWatchlists,
    });
  } catch (error: any) {
    console.error("Error fetching watchlists:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch watchlists" },
      { status: 500 },
    );
  }
}

// POST - Create new watchlist
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const newList = {
      id: crypto.randomUUID(),
      userId: session.user.id,
      name,
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(watchlists).values(newList);

    return NextResponse.json({
      success: true,
      data: newList,
    });
  } catch (error: any) {
    console.error("Error creating watchlist:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create watchlist" },
      { status: 500 },
    );
  }
}

// DELETE - Delete a watchlist
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const listId = searchParams.get("id");

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    // items will be deleted by cascade, but let's be explicit if needed or rely on cascade
    await db
      .delete(watchlists)
      .where(
        and(eq(watchlists.id, listId), eq(watchlists.userId, session.user.id)),
      );

    return NextResponse.json({
      success: true,
      message: "Watchlist deleted",
    });
  } catch (error: any) {
    console.error("Error deleting watchlist:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete watchlist" },
      { status: 500 },
    );
  }
}

// PATCH - Rename a watchlist
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, name } = body;

    if (!id || !name) {
      return NextResponse.json(
        { error: "ID and Name are required" },
        { status: 400 },
      );
    }

    await db
      .update(watchlists)
      .set({ name, updatedAt: new Date() })
      .where(
        and(eq(watchlists.id, id), eq(watchlists.userId, session.user.id)),
      );

    const updatedList = await db
      .select()
      .from(watchlists)
      .where(eq(watchlists.id, id))
      .get();

    return NextResponse.json({
      success: true,
      data: updatedList,
    });
  } catch (error: any) {
    console.error("Error renaming watchlist:", error);
    return NextResponse.json(
      { error: error.message || "Failed to rename watchlist" },
      { status: 500 },
    );
  }
}
