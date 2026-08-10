import { NextRequest, NextResponse } from "next/server";
import {
  getMarkets,
  syncMarkets,
  syncAllMarkets,
  searchMarkets,
  searchMarketsInDB,
  saveMarkets,
  calculatePriceChanges,
} from "@/packages/investing/src/prediction";

// Helper to safely parse JSON or return array
function safeParseArray(value: any, splitter: string | null = null) {
  if (Array.isArray(value)) {
    // Check if it's an array containing a single string that needs parsing (double serialization)
    if (
      value.length === 1 &&
      typeof value[0] === "string" &&
      value[0].trim().startsWith("[")
    ) {
      try {
        const parsed = JSON.parse(value[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // Ignore JSON parse errors and return original array
      }
    }
    return value;
  }

  if (!value) return [];

  // If it's a string, try to parse it
  if (typeof value === "string") {
    // Try JSON parse if it looks like an array
    if (value.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(value);
        // Handle double-stringification
        if (typeof parsed === "string") {
          try {
            return JSON.parse(parsed);
          } catch {
            return [parsed];
          }
        }
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        // Fallthrough to splitter if JSON parse fails
      }
    }

    // Try splitting by delimiter
    if (splitter) {
      return value
        .split(splitter)
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const window = searchParams.get("window") || "24h";
    const category = searchParams.get("category") || undefined;
    const sync = searchParams.get("sync") === "true";
    const search = searchParams.get("search") || "";

    // If search query provided, search in database
    if (search && search.trim() !== "") {
      const sortBy = window === "total" ? "volumeTotal" : "volume24hr";
      const searchResults = await searchMarketsInDB(search, {
        limit,
        offset,
        sortBy: sortBy as any,
        category,
        activeOnly: true,
      });

      // Format search results and calculate price changes
      const formattedMarkets = await Promise.all(
        searchResults.map(async (m: any) => {
          const clobTokenIds = safeParseArray(m.clobTokenIds);
          const outcomePrices = safeParseArray(m.outcomePrices, ",");

          // Calculate price changes for the first token (typically "Yes" outcome)
          let priceChanges: {
            daily: number | null;
            weekly: number | null;
            monthly: number | null;
          } = { daily: null, weekly: null, monthly: null };
          if (clobTokenIds.length > 0 && outcomePrices.length > 0) {
            const tokenId = clobTokenIds[0];
            const currentPrice = parseFloat(outcomePrices[0]);

            // Validate token ID before calculating
            if (
              tokenId &&
              typeof tokenId === "string" &&
              tokenId.length >= 10 &&
              /^[a-zA-Z0-9_-]+$/.test(tokenId)
            ) {
              priceChanges = await calculatePriceChanges(tokenId, currentPrice);
            }
          }

          return {
            id: m.id,
            question: m.question,
            slug: m.slug,
            eventSlug: m.eventSlug,
            volume24hr: Math.floor(m.volume24hr || 0),
            volumeTotal: Math.floor(m.volumeTotal || 0),
            active: m.active,
            closed: m.closed,
            outcomes: safeParseArray(m.outcomes, ","),
            outcomePrices: outcomePrices,
            clobTokenIds: clobTokenIds,
            image: m.image,
            description: m.description,
            endDate: m.endDate,
            groupItemTitle: m.groupItemTitle,
            enableOrderBook: m.enableOrderBook,
            tags: safeParseArray(m.tags),
            category: m.category,
            subcategory: m.subcategory,
            priceChanges, // Add price changes to the response
          };
        }),
      );

      return NextResponse.json({
        success: true,
        markets: formattedMarkets,
        count: formattedMarkets.length,
        source: "database-search",
        timestamp: new Date().toISOString(),
      });
    }

    // If sync requested, fetch fresh data from API
    if (sync) {
      await syncMarkets(limit);
    }

    // Pick which field to sort on
    const sortBy = window === "total" ? "volumeTotal" : "volume24hr";

    // Get markets from database
    const markets = await getMarkets({
      limit,
      offset,
      sortBy: sortBy as any,
      category,
      activeOnly: true,
    });

    // Transform data for frontend and calculate price changes
    const formattedMarkets = await Promise.all(
      markets.map(async (m: any) => {
        const clobTokenIds = safeParseArray(m.clobTokenIds);
        const outcomePrices = safeParseArray(m.outcomePrices, ",");

        // Calculate price changes for the first token (typically "Yes" outcome)
        let priceChanges: {
          daily: number | null;
          weekly: number | null;
          monthly: number | null;
        } = { daily: null, weekly: null, monthly: null };
        if (clobTokenIds.length > 0 && outcomePrices.length > 0) {
          const tokenId = clobTokenIds[0];
          const currentPrice = parseFloat(outcomePrices[0]);

          // Validate token ID before calculating
          if (
            tokenId &&
            typeof tokenId === "string" &&
            tokenId.length >= 10 &&
            /^[a-zA-Z0-9_-]+$/.test(tokenId)
          ) {
            priceChanges = await calculatePriceChanges(tokenId, currentPrice);
          }
        }

        return {
          id: m.id,
          question: m.question,
          slug: m.slug,
          eventSlug: m.eventSlug,
          volume24hr: Math.floor(m.volume24hr),
          volumeTotal: Math.floor(m.volumeTotal),
          active: m.active,
          closed: m.closed,
          outcomes: safeParseArray(m.outcomes, ","),
          outcomePrices: outcomePrices,
          clobTokenIds: clobTokenIds,
          image: m.image,
          description: m.description,
          endDate: m.endDate,
          groupItemTitle: m.groupItemTitle,
          enableOrderBook: m.enableOrderBook,
          tags: safeParseArray(m.tags),
          category: m.category,
          subcategory: m.subcategory,
          priceChanges, // Add price changes to the response
        };
      }),
    );

    return NextResponse.json({
      success: true,
      markets: formattedMarkets,
      count: formattedMarkets.length,
      source: sync ? "api-sync" : "database",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Polymarket API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch markets",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

// POST endpoint for manual sync
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const limit = body.limit || 200;

    const result = await syncMarkets(limit);

    return NextResponse.json({
      success: true,
      synced: result.markets,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Polymarket sync error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to sync markets",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
