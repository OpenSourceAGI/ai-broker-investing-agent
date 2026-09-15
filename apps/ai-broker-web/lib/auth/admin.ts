import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env/runtime";
import { getSession } from "./session";

/**
 * Admin access comes exclusively from the ADMIN_EMAILS (or singular
 * ADMIN_EMAIL) variable — a comma-separated list of addresses; the two are
 * merged. With neither set nobody is an admin: there is deliberately no
 * fallback such as "the first registered user", which would silently grant
 * admin on any deployment that forgot to configure the list.
 *
 * The value is read through `serverEnv` rather than `process.env` because on
 * Cloudflare Workers secrets arrive on the Worker env object, and reading
 * `process.env` there returns undefined — which would read as an empty
 * allowlist, i.e. nobody is an admin, rather than as a visible failure.
 */
export function getAdminEmails(): string[] {
  const raw = [serverEnv("ADMIN_EMAIL") ?? "", serverEnv("ADMIN_EMAILS") ?? ""].join(",");

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  return admins.includes(email.toLowerCase());
}

export interface AdminAccess {
  isAdmin: boolean;
  email: string | null;
}

/** Resolves the caller's admin status from the session, for server components. */
export async function getAdminAccess(): Promise<AdminAccess> {
  const session = await getSession();
  const email = session?.user?.email?.toLowerCase() ?? null;
  return { isAdmin: isAdminEmail(email), email };
}

/**
 * Route guard. Returns the response to send when the caller is not an admin,
 * or `null` to continue — so a handler reads as
 * `const guard = await assertAdmin(); if (guard) return guard;`.
 */
export async function assertAdmin(): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(session.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
