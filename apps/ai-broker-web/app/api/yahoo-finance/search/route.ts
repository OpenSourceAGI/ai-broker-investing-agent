import { NextRequest, NextResponse } from "next/server";
import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/yahoo-finance/search
 * Search for stocks by query
 * Query params: q (query), quotesCount, newsCount
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const quotesCount = searchParams.get("quotesCount");
    const newsCount = searchParams.get("newsCount");

    const options: any = {};

    if (quotesCount) {
      options.quotesCount = parseInt(quotesCount);
    }

    if (newsCount) {
      options.newsCount = parseInt(newsCount);
    }

    const result = await yahooFinance.search(query, options);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error("Yahoo Finance search API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to search" },
      { status: 500 }
    );
  }
}
