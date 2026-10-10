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
      columns: { surveyResponse: true, surveyDismissedAt: true }
    });

    const hasCompletedSurvey = !!(user?.surveyResponse && user.surveyResponse.trim() !== '');
    const hasDismissedSurvey = !!user?.surveyDismissedAt;

    return NextResponse.json({
      hasCompletedSurvey,
      hasDismissedSurvey,
      // The survey is only auto-shown until the user completes or dismisses it;
      // after that it is reachable from Settings.
      shouldShowSurvey: !hasCompletedSurvey && !hasDismissedSurvey,
    });
  } catch (error) {
    console.error("Error checking survey status:", error);
    return NextResponse.json(
      { error: "Failed to check survey status" },
      { status: 500 }
    );
  }
}
