import { NextResponse } from "next/server";
import {
  ALL_INSTRUMENTS,
  FOREX_INSTRUMENTS,
  CRYPTO_INSTRUMENTS,
  STOCK_INSTRUMENTS,
  ETF_INSTRUMENTS,
  INDEX_INSTRUMENTS,
  COMMODITY_INSTRUMENTS,
  BOND_INSTRUMENTS,
  getInstrumentsByCategory,
  searchInstruments,
  type AssetCategory,
} from "@/packages/investing/src/live-data/dukascopy-client";

export const runtime = "nodejs";

/**
 * GET /api/forex/instruments
 * Returns list of supported trading instruments
 *
 * Query parameters:
 * - category: Filter by asset category (forex, crypto, stocks, etfs, indices, commodities, bonds)
 * - search: Search instruments by symbol, name, or description
 *
 * Examples:
 * - /api/forex/instruments - Returns all instruments
 * - /api/forex/instruments?category=stocks - Returns only stocks
 * - /api/forex/instruments?search=apple - Searches for "apple"
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") as AssetCategory | null;
    const searchQuery = searchParams.get("search");

    let instruments = ALL_INSTRUMENTS;

    // Filter by category if specified
    if (category) {
      instruments = getInstrumentsByCategory(category);
    }

    // Search if query provided
    if (searchQuery) {
      instruments = searchInstruments(searchQuery);
    }

    // Group by category for easier client consumption
    const grouped = {
      forex: instruments.filter((i) => i.category === "forex"),
      crypto: instruments.filter((i) => i.category === "crypto"),
      stocks: instruments.filter((i) => i.category === "stocks"),
      etfs: instruments.filter((i) => i.category === "etfs"),
      indices: instruments.filter((i) => i.category === "indices"),
      commodities: instruments.filter((i) => i.category === "commodities"),
      bonds: instruments.filter((i) => i.category === "bonds"),
    };

    return NextResponse.json({
      success: true,
      total: instruments.length,
      data: instruments,
      grouped,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch instruments",
      },
      { status: 500 },
    );
  }
}
