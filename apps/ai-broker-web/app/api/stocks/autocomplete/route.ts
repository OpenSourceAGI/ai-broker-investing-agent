// Stock Autocomplete API Route
import { NextRequest, NextResponse } from "next/server";
import { stockNames } from "investing/stocks";

// Use the imported stock names data directly
const stockCache = stockNames;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase();
    const limit = parseInt(searchParams.get("limit") || "10");

    if (!query || query.length < 1) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Filter stocks: match beginning of symbol OR includes in name
    // Optimize for speed: simple loop
    const results = [];
    for (const stock of stockCache) {
      // stock format: [symbol, name, industryId, marketCap, cik]
      const symbol = String(stock[0] || "").toLowerCase();
      const name = String(stock[1] || "").toLowerCase();

      if (symbol.startsWith(query) || name.includes(query)) {
        results.push({
          symbol: stock[0],
          name: stock[1],
        });
        if (results.length >= limit) break;
      }
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      data: results,
    });
  } catch (error: any) {
    console.error("Autocomplete Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch suggestions" },
      { status: 500 },
    );
  }
}
