// Stock Autocomplete API Route
import { NextRequest, NextResponse } from "next/server";
import { stockNames } from "investing/stocks";

// Use the imported stock names data directly
const stockCache = stockNames;

/** Suggestions returned when the caller names no limit. */
const DEFAULT_AUTOCOMPLETE_RESULTS = 10;
/** Ceiling on suggestions; a typeahead dropdown cannot use more than this. */
const MAX_AUTOCOMPLETE_RESULTS = 50;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.toLowerCase();

    // Clamp the limit. `parseInt` on a non-numeric value yields NaN, and every
    // `results.length >= NaN` comparison is false, so the loop used to run to
    // the end of the dataset and return thousands of rows to a typeahead.
    const parsedLimit = Number.parseInt(searchParams.get("limit") || "", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_AUTOCOMPLETE_RESULTS)
      : DEFAULT_AUTOCOMPLETE_RESULTS;

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
