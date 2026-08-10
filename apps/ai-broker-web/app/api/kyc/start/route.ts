import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import axios from "axios";
import { RESUBMITTABLE_KYC_STATUSES } from "@/lib/kyc/didit-webhook";

/**
 * POST /api/kyc/start
 * Initiates a KYC verification session with Didit.me.
 * Also used to resubmit after a rejected, abandoned, or expired
 * verification — a new Didit session replaces the previous one.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user already has KYC approved
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: {
        id: true,
        email: true,
        kycStatus: true,
        kycSessionId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.kycStatus === "approved") {
      return NextResponse.json(
        { error: "KYC already approved for this account" },
        { status: 400 }
      );
    }
    // Any other status (rejected, abandoned, expired, or a pending session
    // the user closed) may start a new session; the webhook handler ignores
    // late events from the replaced session.

    // Check for required environment variables
    const apiKey = process.env.DIDIT_API_KEY;
    const workflowId = process.env.DIDIT_WORKFLOW_ID;

    if (!apiKey || !workflowId) {
      console.error("Missing DIDIT_API_KEY or DIDIT_WORKFLOW_ID environment variables");
      return NextResponse.json(
        { error: "KYC service not configured" },
        { status: 500 }
      );
    }

    // Create a new Didit verification session
    const response = await axios.post(
      "https://verification.didit.me/v2/session/",
      {
        workflow_id: workflowId,
        vendor_data: user.id, // Our internal user ID, echoed back in webhooks
        external_id: user.id,
        metadata: {
          email: user.email,
        },
      },
      {
        headers: {
          "X-Api-Key": apiKey,
          "Content-Type": "application/json",
        },
      }
    );

    const { id: sessionId, url } = response.data;

    // Update user with the new session ID and status
    await db
      .update(users)
      .set({
        kycSessionId: sessionId,
        kycStatus: "pending",
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({
      success: true,
      sessionId,
      url,
    });
  } catch (error: any) {
    console.error("Error creating Didit KYC session:", error);

    // Handle Didit API errors
    if (error.response?.data) {
      return NextResponse.json(
        {
          error: "Failed to create KYC session",
          details: error.response.data,
        },
        { status: error.response.status || 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create KYC session" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/kyc/start
 * Returns the current KYC status for the user
 */
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
      columns: {
        kycStatus: true,
        kycVerifiedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const status = user.kycStatus || "not_started";

    return NextResponse.json({
      status,
      verifiedAt: user.kycVerifiedAt,
      canResubmit: (RESUBMITTABLE_KYC_STATUSES as readonly string[]).includes(
        status
      ),
    });
  } catch (error) {
    console.error("Error fetching KYC status:", error);
    return NextResponse.json(
      { error: "Failed to fetch KYC status" },
      { status: 500 }
    );
  }
}
