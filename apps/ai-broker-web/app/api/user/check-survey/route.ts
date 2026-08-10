import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { surveyResponse: true }
    });

    const hasCompletedSurvey = !!(user?.surveyResponse && user.surveyResponse !== null && user.surveyResponse.trim() !== '');

    return NextResponse.json({ hasCompletedSurvey });
  } catch (error) {
    console.error("Error checking survey status:", error);
    return NextResponse.json(
      { error: "Failed to check survey status" },
      { status: 500 }
    );
  }
}
