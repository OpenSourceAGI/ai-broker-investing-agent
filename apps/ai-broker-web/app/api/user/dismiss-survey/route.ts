import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

/** Records that the user dismissed the survey so it is never auto-shown again. */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    await db.update(users)
      .set({ surveyDismissedAt: now, updatedAt: now })
      .where(eq(users.id, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error dismissing survey:", error);
    return NextResponse.json(
      { error: "Failed to dismiss survey" },
      { status: 500 }
    );
  }
}
