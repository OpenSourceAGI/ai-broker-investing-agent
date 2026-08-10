import { NextRequest, NextResponse } from "next/server";
import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/yahoo-finance/options/[symbol]
 * Get options data (calls and puts) for a stock symbol
 * Query params: date (expiration date)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol.toUpperCase();
    const searchParams = request.nextUrl.searchParams;

    const dateParam = searchParams.get("date");
    const date = dateParam ? new Date(dateParam) : undefined;

    const result = await yahooFinance.getOptions(symbol, date);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error("Yahoo Finance options API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch options data" },
      { status: 500 }
    );
  }
}
