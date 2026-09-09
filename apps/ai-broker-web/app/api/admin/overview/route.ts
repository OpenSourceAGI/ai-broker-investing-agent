import { NextResponse } from "next/server";
import { count, desc } from "drizzle-orm";
import { assertAdmin, getAdminEmails } from "@/lib/auth/admin";
import { getAdminDB } from "@/lib/admin/db";
import { positions, sessions, strategies, trades, users } from "@/lib/db/schema";

/** Compact administrative telemetry; no credentials or session tokens are exposed. */
export async function GET() {
  const guard = await assertAdmin();
  if (guard) return guard;

  const db = getAdminDB();
  const [[userCount], [sessionCount], [strategyCount], [tradeCount], [positionCount], recentUsers] =
    await Promise.all([
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(sessions),
      db.select({ value: count() }).from(strategies),
      db.select({ value: count() }).from(trades),
      db.select({ value: count() }).from(positions),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          image: users.image,
          createdAt: users.createdAt,
          emailVerified: users.emailVerified,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(12),
    ]);

  return NextResponse.json({
    stats: {
      users: userCount?.value ?? 0,
      sessions: sessionCount?.value ?? 0,
      strategies: strategyCount?.value ?? 0,
      trades: tradeCount?.value ?? 0,
      positions: positionCount?.value ?? 0,
    },
    recentUsers,
    adminEmails: getAdminEmails(),
  });
}
