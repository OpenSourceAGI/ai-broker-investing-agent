import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

/**
 * Shared handler for Didit.me webhooks (v3.0).
 *
 * Configured in the Didit dashboard to POST to /api/kyc/webhook with the
 * events: status.updated, data.updated, user.status.updated,
 * user.data.updated, business.status.updated, business.data.updated,
 * activity.created, transaction.created, transaction.status.updated.
 *
 * Only verification-session status events affect our DB; everything else is
 * acknowledged with 200 so Didit does not retry.
 */

// Didit signs the raw body with HMAC-SHA256 using the webhook secret and
// sends it in X-Signature. Older integrations used X-Didit-Signature.
const SIGNATURE_HEADERS = ["x-signature", "x-didit-signature"];

// Reject webhooks whose X-Timestamp is further than this from now.
const MAX_TIMESTAMP_SKEW_SECONDS = 300;

/**
 * Internal statuses from which the user is allowed to start a new
 * verification session (resubmit).
 */
export const RESUBMITTABLE_KYC_STATUSES = [
  "rejected",
  "abandoned",
  "expired",
  "not_started",
] as const;

function verifyDiditSignature(rawBody: string, request: NextRequest): boolean {
  const secret = process.env.DIDIT_WEBHOOK_SECRET;

  if (!secret) {
    console.error("DIDIT_WEBHOOK_SECRET not configured");
    return false;
  }

  const signature = SIGNATURE_HEADERS.map((h) => request.headers.get(h)).find(
    Boolean
  );
  if (!signature) return false;

  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const computedBuf = Buffer.from(computed);
  const signatureBuf = Buffer.from(signature);
  if (
    computedBuf.length !== signatureBuf.length ||
    !crypto.timingSafeEqual(computedBuf, signatureBuf)
  ) {
    return false;
  }

  // v3 webhooks include X-Timestamp (unix seconds); reject stale/replayed events.
  const timestamp = request.headers.get("x-timestamp");
  if (timestamp) {
    const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(skew) || skew > MAX_TIMESTAMP_SKEW_SECONDS) {
      console.error("Didit webhook timestamp outside tolerance:", timestamp);
      return false;
    }
  }

  return true;
}

/**
 * Maps a Didit session status ("Approved", "In Review", "Kyc Expired", ...)
 * to our internal KYC status.
 */
function mapDiditStatus(status: string): string {
  const normalized = status.toLowerCase().replace(/[\s_-]+/g, "_");

  const statusMap: Record<string, string> = {
    approved: "approved",
    declined: "rejected",
    rejected: "rejected",
    in_review: "in_review",
    abandoned: "abandoned",
    expired: "expired",
    kyc_expired: "expired",
    not_started: "pending",
    in_progress: "pending",
    pending: "pending",
  };

  return statusMap[normalized] || "pending";
}

export async function handleDiditWebhook(request: NextRequest) {
  // Read the raw body first — the signature is computed over the exact bytes.
  const rawBody = await request.text();

  if (!verifyDiditSignature(rawBody, request)) {
    console.error("Invalid Didit webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);

    // v3 sends a flat payload with webhook_type; older payloads nested the
    // session under `data` with a `type` field. Support both.
    const payload = event.data ?? event;
    const eventType: string =
      event.webhook_type || event.type || event.event || "unknown";

    const sessionId: string | undefined = payload.session_id;
    const status: string | undefined = payload.status;
    const vendorData: string | undefined =
      payload.vendor_data || payload.external_id;
    const decision = payload.decision;

    console.log("Received Didit webhook:", {
      type: eventType,
      sessionId,
      status,
      vendorData,
    });

    // Events without a session status (activity.created, transaction.*,
    // business.*, ...) don't map to a user's KYC state — acknowledge them so
    // Didit doesn't retry.
    if (!sessionId || !status) {
      return NextResponse.json(
        { message: `Event ${eventType} acknowledged (no session status)` },
        { status: 200 }
      );
    }

    // vendor_data carries our user ID (set when the session is created);
    // fall back to the stored session ID for older sessions.
    let user = vendorData
      ? await db.query.users.findFirst({ where: eq(users.id, vendorData) })
      : undefined;
    if (!user) {
      user = await db.query.users.findFirst({
        where: eq(users.kycSessionId, sessionId),
      });
    }

    if (!user) {
      console.error("User not found for KYC session:", sessionId);
      // Return 200 to prevent Didit from retrying
      return NextResponse.json(
        { message: "User not found, but acknowledged" },
        { status: 200 }
      );
    }

    // Ignore events for sessions the user has since replaced (e.g. an
    // abandoned session expiring after the user already resubmitted).
    if (user.kycSessionId && user.kycSessionId !== sessionId) {
      console.log(
        `Ignoring Didit event for stale session ${sessionId} (current: ${user.kycSessionId})`
      );
      return NextResponse.json(
        { message: "Stale session, acknowledged" },
        { status: 200 }
      );
    }

    const kycStatus = mapDiditStatus(status);

    // Never downgrade an approved user from an out-of-order event.
    if (user.kycStatus === "approved" && kycStatus !== "approved") {
      console.log(
        `Ignoring ${kycStatus} event for already-approved user ${user.id}`
      );
      return NextResponse.json(
        { message: "User already approved, acknowledged" },
        { status: 200 }
      );
    }

    const updateData: Partial<typeof users.$inferInsert> = {
      kycStatus,
      kycSessionId: sessionId,
      updatedAt: new Date(),
    };

    if (kycStatus === "approved") {
      updateData.kycVerifiedAt = new Date();
    }

    await db.update(users).set(updateData).where(eq(users.id, user.id));

    console.log(`Updated KYC status for user ${user.id}:`, kycStatus);

    if (decision) {
      console.log("KYC Decision details:", {
        userId: user.id,
        sessionId,
        decision,
      });
    }

    return NextResponse.json({
      message: "Webhook processed successfully",
      userId: user.id,
      status: kycStatus,
      canResubmit: (RESUBMITTABLE_KYC_STATUSES as readonly string[]).includes(
        kycStatus
      ),
    });
  } catch (error: any) {
    console.error("Error processing Didit webhook:", error);

    // Signature was valid but processing failed (bad JSON, DB error).
    // Return 500 so Didit retries the delivery.
    return NextResponse.json(
      { error: "Error processing webhook" },
      { status: 500 }
    );
  }
}

export function diditWebhookHealthcheck() {
  return NextResponse.json({
    message: "Didit webhook endpoint is active",
    timestamp: new Date().toISOString(),
  });
}
