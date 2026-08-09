import { NextRequest, NextResponse } from "next/server";
import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/yahoo-finance/chart/[symbol]
 * Get chart data for a stock symbol (supports intraday intervals)
 * Query params: period1, period2, interval
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol.toUpperCase();
    const searchParams = request.nextUrl.searchParams;

    const period1 = searchParams.get("period1");
    const period2 = searchParams.get("period2");
    const interval = searchParams.get("interval") as "1m" | "5m" | "15m" | "1h" | "1d" | "1wk" | "1mo" | undefined;

    const options: any = {};

    if (period1) {
      options.period1 = new Date(period1);
    }

    if (period2) {
      options.period2 = new Date(period2);
    }

    if (interval) {
      options.interval = interval;
    }

    const result = await yahooFinance.getChart(symbol, options);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error("Yahoo Finance chart API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch chart data" },
      { status: 500 }
    );
  }
}
