import { NextRequest, NextResponse } from "next/server";
import {
  getRealTimeData,
  getInstrumentBySymbol,
} from "@/packages/investing/src/live-data/dukascopy-client";

export const runtime = "nodejs";

/**
 * GET /api/forex/realtime/[instrument]
 * Fetch real-time market data for any supported instrument
 *
 * Supports: Forex, Stocks, Crypto, ETFs, Indices, Commodities, Bonds
 *
 * Query parameters:
 * - timeframe: tick, s1, m1, m5, m15, m30, h1, h4, d1 (default: tick)
 * - format: json, array, csv (default: json)
 * - priceType: bid, ask (default: bid)
 * - last: number of candles/ticks (default: 10)
 * - volumes: include volume data (default: true)
 * - from, to: optional date range
 *
 * Examples:
 * - /api/forex/realtime/eurusd?timeframe=m5&last=100
 * - /api/forex/realtime/AAPL.US/USD?timeframe=h1&last=50
 * - /api/forex/realtime/BTCUSD?timeframe=m15&last=200
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { instrument: string } },
) {
  try {
    const { instrument } = params;
    const searchParams = request.nextUrl.searchParams;

    // Get parameters
    const timeframe = (searchParams.get("timeframe") || "tick") as any;
    const format = (searchParams.get("format") || "json") as any;
    const priceType = (searchParams.get("priceType") || "bid") as any;
    const last = parseInt(searchParams.get("last") || "10");
    const volumes = searchParams.get("volumes") !== "false";

    // Optional date range (if not provided, uses 'last' parameter)
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Get instrument metadata if available
    const instrumentMeta = getInstrumentBySymbol(instrument);

    const result = await getRealTimeData({
      instrument: instrument as any,
      timeframe,
      format,
      priceType,
      last,
      volumes,
      ...(from && {
        dates: {
          from: new Date(from),
          to: to ? new Date(to) : new Date(),
        },
      }),
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
    console.error("Market real-time API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
      },
      { status: 500 },
    );
  }
}
