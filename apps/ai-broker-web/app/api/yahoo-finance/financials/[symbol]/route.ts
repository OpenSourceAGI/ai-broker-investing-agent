import { NextRequest, NextResponse } from "next/server";
import { yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/yahoo-finance/financials/[symbol]
 * Get financial statements (income, balance sheet, cash flow)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
) {
  try {
    const symbol = params.symbol.toUpperCase();
    const result = await yahooFinance.getFinancialStatements(symbol);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.data);
  } catch (error: any) {
    console.error("Yahoo Finance financials API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch financial statements" },
      { status: 500 }
    );
  }
}
