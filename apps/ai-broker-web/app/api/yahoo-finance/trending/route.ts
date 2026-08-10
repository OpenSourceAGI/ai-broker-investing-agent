import { NextRequest, NextResponse } from "next/server";
import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/yahoo-finance/trending
 * Get trending symbols by region
 * Query params: region (e.g., "US", "GB", "JP")
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const region = searchParams.get("region") || "US";

    const result = await yahooFinance.getTrending(region);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error("Yahoo Finance trending API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch trending symbols" },
      { status: 500 }
    );
  }
}
