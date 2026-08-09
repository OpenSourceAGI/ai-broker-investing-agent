import { NextRequest } from "next/server";
import {
  handleDiditWebhook,
  diditWebhookHealthcheck,
} from "@/lib/kyc/didit-webhook";

/**
 * POST /api/webhooks/didit
 * Legacy Didit.me webhook URL — kept for backward compatibility.
 * The dashboard-configured endpoint is /api/kyc/webhook; both share the
 * same handler.
 */
export async function POST(request: NextRequest) {
  return handleDiditWebhook(request);
}

/**
 * GET /api/webhooks/didit
 * Health check endpoint
 */
export async function GET() {
  return diditWebhookHealthcheck();
}
