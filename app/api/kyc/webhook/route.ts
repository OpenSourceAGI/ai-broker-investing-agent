import { NextRequest } from "next/server";
import {
  handleDiditWebhook,
  diditWebhookHealthcheck,
} from "@/lib/kyc/didit-webhook";

/**
 * POST /api/kyc/webhook
 * Didit.me webhook endpoint (v3.0) — the URL configured in the Didit
 * dashboard (https://autoinvestment.broker/api/kyc/webhook).
 */
export async function POST(request: NextRequest) {
  return handleDiditWebhook(request);
}

/**
 * GET /api/kyc/webhook
 * Health check endpoint
 */
export async function GET() {
  return diditWebhookHealthcheck();
}
