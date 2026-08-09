// Stock Quote API Route - Using Unified Quote Service
import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/packages/investing/src/stocks/unified-quote-service";
import { finnhub } from "@/packages/investing/src/stocks/finnhub-wrapper";
import stockNamesData from "@/packages/investing/src/stock-names-data/stock-names.json";
import sectorsIndustriesData from "@/packages/investing/src/stock-names-data/sectors-industries.json";

// Type definitions for the data structure
type StockNameEntry = [string, string, number, number, number]; // [symbol, name, industryId, marketCap, unknown]
type IndustryEntry = [number, string, string, number]; // [id, name, emoji, sectorId]
type SectorsMap = Record<string, number>; // { "Sector Name": sectorId }

// Helper function to get sector/industry info from stock names data
function getSectorIndustryInfo(symbol: string): {
  sector?: string;
  industry?: string;
  industryEmoji?: string;
  sectorId?: number;
  industryId?: number;
} | null {
  try {
    // Find the stock in stock-names data
    const stockData = (stockNamesData as StockNameEntry[]).find(
      (stock) => stock[0] === symbol.toUpperCase()
    );

    if (!stockData || !stockData[2]) {
      return null;
    }

    const industryId = stockData[2];

    // Find the industry in sectors-industries data
    const industries = sectorsIndustriesData.industries as IndustryEntry[];
    const industryEntry = industries.find((ind) => ind[0] === industryId);

    if (!industryEntry) {
      return null;
    }

    const industryName = industryEntry[1];
    const industryEmoji = industryEntry[2];
    const sectorId = industryEntry[3];

    // Find the sector name by sectorId
    const sectors = sectorsIndustriesData.sectors as SectorsMap;
    const sectorName = Object.keys(sectors).find(
      (key) => sectors[key] === sectorId
    );

    return {
      sector: sectorName,
      industry: industryName,
      industryEmoji,
      sectorId,
      industryId,
    };
  } catch (error) {
    console.error("Error looking up sector/industry info:", error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  try {
    const { symbol } = await params;
    const searchParams = request.nextUrl.searchParams;
    const liveParam = searchParams.get("live");
    const useCache = liveParam !== "true"; // Use cache by default, bypass if live=true

    // Fetch quote data using unified service (with cache support)
    const quoteResult = await getQuote(symbol, { useCache });

    if (!quoteResult.success || !quoteResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: quoteResult.error || "Failed to fetch quote",
          code: "QUOTE_ERROR",
          timestamp: new Date().toISOString(),
        },
        { status: 500 },
      );
    }

    const quote = quoteResult.data;

    // Fetch peers/related stocks
    let peers: string[] = [];
    try {
      const peersResult = await finnhub.getPeers(symbol);
      if (peersResult.success && peersResult.peers) {
        peers = peersResult.peers.filter((p: string) => p !== symbol);
      }
    } catch (e) {
      console.warn(`Failed to fetch peers for ${symbol}`, e);
    }

    // Fetch additional profile data for sector/industry
    let summaryProfile = null;
    try {
      const profileResult = await finnhub.getQuote({ symbol });
      if (profileResult.success && profileResult.data?.summaryProfile) {
        summaryProfile = profileResult.data.summaryProfile;
      }
    } catch (e) {
      console.warn(`Failed to fetch profile for ${symbol}`, e);
    }

    // Get sector/industry info from stock-names data
    const sectorIndustryInfo = getSectorIndustryInfo(symbol);

    // Merge sector/industry info into summaryProfile
    if (sectorIndustryInfo) {
      summaryProfile = {
        ...summaryProfile,
        sector: sectorIndustryInfo.sector,
        industry: sectorIndustryInfo.industry,
        // Include longBusinessSummary if it exists in the original profile
        longBusinessSummary: summaryProfile?.longBusinessSummary,
      };
    }

    return NextResponse.json({
      success: true,
      symbol,
      data: {
        price: {
          regularMarketPrice: quote.price,
          regularMarketChange: quote.change,
          regularMarketChangePercent: quote.changePercent,
          regularMarketTime: quote.timestamp,
          marketCap: quote.marketCap,
          currency: quote.currency,
          longName: quote.name,
          shortName: quote.name,
          exchange: quote.exchange,
          sector: sectorIndustryInfo?.sector,
          industry: sectorIndustryInfo?.industry,
        },
        summaryDetail: {
          open: quote.open,
          dayHigh: quote.high,
          dayLow: quote.low,
          previousClose: quote.previousClose,
          regularMarketVolume: quote.volume,
          sector: sectorIndustryInfo?.sector,
          industry: sectorIndustryInfo?.industry,
        },
        summaryProfile,
        peers,
      },
      source: quote.source,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch quote",
        code: "QUOTE_ERROR",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
