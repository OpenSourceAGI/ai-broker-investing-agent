import { NextRequest, NextResponse } from "next/server";
import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/yahoo-finance/comprehensive/[symbol]
 * Get all available data for a stock (quote, summary, historical, recommendations)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol.toUpperCase();
    const result = await yahooFinance.getComprehensiveData(symbol);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error("Yahoo Finance comprehensive API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch comprehensive data" },
      { status: 500 }
    );
  }
}
