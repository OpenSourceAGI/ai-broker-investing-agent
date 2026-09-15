import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { getAdminDB } from "@/lib/admin/db";
import { DEFAULT_SORT, loadSiteUsageTotals, loadUserUsagePage } from "@/lib/admin/user-usage";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function intParam(raw: string | null, fallback: number): number {
  const parsed = parseInt(raw ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Paginated user directory with per-user usage counters, for the admin page.
 * Supports search over name/email/id, an unverified-account filter, and
 * sorting by any column — usage counters included — so power users and
 * dormant accounts can both be found without paging through the whole
 * directory.
 */
export async function GET(req: NextRequest) {
  const guard = await assertAdmin();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  // `|| fallback` would turn an explicit `0` into the default instead of
  // clamping it, so unparseable input is caught with Number.isNaN.
  const page = Math.max(1, intParam(searchParams.get("page"), 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, intParam(searchParams.get("limit"), DEFAULT_LIMIT)));

  const db = getAdminDB();

  const [{ users, matchedUsers }, totals] = await Promise.all([
    loadUserUsagePage(db, {
      page,
      limit,
      search: searchParams.get("q")?.trim() || undefined,
      hideUnverified: searchParams.get("hideUnverified") === "true",
      sort: searchParams.get("sort") ?? DEFAULT_SORT,
      dir: searchParams.get("dir") === "asc" ? "asc" : "desc",
    }),
    loadSiteUsageTotals(db),
  ]);

  return NextResponse.json({
    users,
    page,
    limit,
    matchedUsers,
    pageCount: Math.max(Math.ceil(matchedUsers / limit), 1),
    totals,
  });
}
