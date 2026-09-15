import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assertAdmin } from "@/lib/auth/admin";
import { getAdminDB } from "@/lib/admin/db";
import { users } from "@/lib/db/schema";

type Params = { params: Promise<{ id: string }> };

/**
 * The fields an admin may change on an account, and how each is coerced.
 * Anything else in the body is dropped rather than written — a crafted request
 * must not be able to reach a broker credential or an API key on this table.
 */
const EDITABLE = {
  name: (value: unknown) => (typeof value === "string" ? value : undefined),
  email: (value: unknown) => (typeof value === "string" ? value : undefined),
  emailVerified: (value: unknown) => (typeof value === "boolean" ? value : undefined),
  trialAllowed: (value: unknown) => (typeof value === "boolean" ? value : undefined),
  alpacaPaper: (value: unknown) => (typeof value === "boolean" ? value : undefined),
  kycStatus: (value: unknown) => (typeof value === "string" ? value : undefined),
  usageCount: (value: unknown) => {
    const parsed = typeof value === "number" ? value : Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  },
} as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await assertAdmin();
  if (guard) return guard;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [field, coerce] of Object.entries(EDITABLE)) {
    if (!(field in body)) continue;
    const value = coerce((body as Record<string, unknown>)[field]);
    if (value === undefined) {
      return NextResponse.json({ error: `Invalid value for ${field}` }, { status: 400 });
    }
    updates[field] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const rows = await getAdminDB()
    .update(users)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (!rows.length) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // The row carries broker credentials; only the fields the directory renders
  // are echoed back.
  const { apiKey, alpacaKeyId, alpacaSecretKey, kycSessionId, ...safe } = rows[0];
  return NextResponse.json({ user: safe });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await assertAdmin();
  if (guard) return guard;

  const { id } = await params;
  const rows = await getAdminDB().delete(users).where(eq(users.id, id)).returning();

  if (!rows.length) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
