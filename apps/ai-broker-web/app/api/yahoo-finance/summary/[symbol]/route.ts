import { NextRequest, NextResponse } from "next/server";
import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/yahoo-finance/summary/[symbol]
 * Get comprehensive quote summary with multiple modules
 * Query params: modules (comma-separated list)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol.toUpperCase();
    const searchParams = request.nextUrl.searchParams;

    const modulesParam = searchParams.get("modules");
    const modules = modulesParam ? modulesParam.split(",") : undefined;

    const result = await yahooFinance.getQuoteSummary(symbol, modules);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error("Yahoo Finance summary API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch quote summary" },
      { status: 500 }
    );
  }
}
