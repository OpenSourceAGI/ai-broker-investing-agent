import { NextRequest, NextResponse } from "next/server";
import {
  getHistoricalData,
  getInstrumentBySymbol,
} from "@/packages/investing/src/live-data/dukascopy-client";

export const runtime = "nodejs";

/**
 * GET /api/forex/historical/[instrument]
 * Fetch historical market data for any supported instrument
 *
 * Supports: Forex, Stocks, Crypto, ETFs, Indices, Commodities, Bonds
 *
 * Query parameters:
 * - from: start date (ISO string or timestamp)
 * - to: end date (optional, defaults to now)
 * - range: shorthand (1d, 7d, 1mo, etc.)
 * - timeframe: d1, h1, m15, m5, m1, s1 (default: d1)
 * - format: json, array, csv (default: json)
 * - priceType: bid, ask (default: bid)
 * - volumes: include volume (default: true)
 *
 * Examples:
 * - /api/forex/historical/eurusd?range=30d&timeframe=h1
 * - /api/forex/historical/AAPL.US/USD?from=2024-01-01&to=2024-12-31&timeframe=d1
 * - /api/forex/historical/BTCUSD?range=7d&timeframe=m15
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { instrument: string } },
) {
  try {
    const { instrument } = params;
    const searchParams = request.nextUrl.searchParams;

    // Get date range
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const range = searchParams.get("range"); // e.g., '1d', '7d', '1mo'

    // Get other parameters
    const timeframe = (searchParams.get("timeframe") || "d1") as any;
    const format = (searchParams.get("format") || "json") as any;
    const priceType = (searchParams.get("priceType") || "bid") as any;
    const volumes = searchParams.get("volumes") !== "false";

    // Calculate date range
    let fromDate: Date;
    let toDate: Date = new Date();

    if (from) {
      fromDate = new Date(from);
    } else if (range) {
      // Parse range string
      const rangeMatch = range.match(/^(\d+)([dmyhw])$/);
      if (!rangeMatch) {
        return NextResponse.json(
          { success: false, error: "Invalid range format" },
          { status: 400 },
        );
      }

      const [, value, unit] = rangeMatch;
      const now = new Date();
      fromDate = new Date(now);

      switch (unit) {
        case "d":
          fromDate.setDate(now.getDate() - parseInt(value));
          break;
        case "w":
          fromDate.setDate(now.getDate() - parseInt(value) * 7);
          break;
        case "m":
          fromDate.setMonth(now.getMonth() - parseInt(value));
          break;
        case "y":
          fromDate.setFullYear(now.getFullYear() - parseInt(value));
          break;
        case "h":
          fromDate.setHours(now.getHours() - parseInt(value));
          break;
      }
    } else {
      // Default to 1 month
      fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 1);
    }

    if (to) {
      toDate = new Date(to);
    }

    // Get instrument metadata if available
    const instrumentMeta = getInstrumentBySymbol(instrument);

    const result = await getHistoricalData({
      instrument: instrument as any,
      dates: {
        from: fromDate,
        to: toDate,
      },
      timeframe,
      format,
      priceType,
      volumes,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    // Include instrument metadata in response
    return NextResponse.json({
      ...result,
      instrument: instrumentMeta,
    });
  } catch (error: any) {
    console.error("Market historical API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 },
    );
  }
}
