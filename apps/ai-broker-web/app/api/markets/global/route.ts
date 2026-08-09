import { NextRequest, NextResponse } from "next/server";
import { getRealTimeData, getHistoricalData } from "@/packages/investing/src/live-data/dukascopy-client";
import { db } from "@/lib/db";
import { dukascopyIndexCache } from "@/packages/investing/src/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

// Map of Dukascopy symbols to display info
const GLOBAL_INDICES = [
  { symbol: "usa30idxusd", name: "Dow Jones", country: "USA", countryCode: "US" },
  { symbol: "usa500idxusd", name: "S&P 500", country: "USA", countryCode: "US" },
  { symbol: "usatechidxusd", name: "Nasdaq 100", country: "USA", countryCode: "US" },
  { symbol: "ussc2000idxusd", name: "Russell 2000", country: "USA", countryCode: "US" },
  { symbol: "volidxusd", name: "VIX", country: "USA", countryCode: "US" },
  { symbol: "gbridxgbp", name: "FTSE 100", country: "UK", countryCode: "GB" },
  { symbol: "deuidxeur", name: "DAX 40", country: "Germany", countryCode: "DE" },
  { symbol: "fraidxeur", name: "CAC 40", country: "France", countryCode: "FR" },
  { symbol: "eusidxeur", name: "Euro Stoxx 50", country: "Europe", countryCode: "EU" },
  { symbol: "jpnidxjpy", name: "Nikkei 225", country: "Japan", countryCode: "JP" },
  { symbol: "hkgidxhkd", name: "Hang Seng", country: "Hong Kong", countryCode: "HK" },
  { symbol: "chiidxusd", name: "China A50", country: "China", countryCode: "CN" },
  { symbol: "ausidxaud", name: "ASX 200", country: "Australia", countryCode: "AU" },
  { symbol: "indidxusd", name: "Nifty 50", country: "India", countryCode: "IN" },
  { symbol: "cheidxchf", name: "SMI", country: "Switzerland", countryCode: "CH" },
  { symbol: "espidxeur", name: "IBEX 35", country: "Spain", countryCode: "ES" },
  { symbol: "itaidxeur", name: "FTSE MIB", country: "Italy", countryCode: "IT" },
  { symbol: "nldidxeur", name: "AEX", country: "Netherlands", countryCode: "NL" },
  { symbol: "soaidxzar", name: "JSE Top 40", country: "South Africa", countryCode: "ZA" },
  { symbol: "sgdidxsgd", name: "STI", country: "Singapore", countryCode: "SG" },
];

/**
 * Fetch index data from cache if fresh
 */
async function getCachedIndexData(symbol: string) {
  try {
    const cached = await db.select().from(dukascopyIndexCache).where(eq(dukascopyIndexCache.symbol, symbol)).limit(1);

    if (cached.length === 0) {
      return null;
    }

    const data = cached[0];
    const now = Date.now();
    const lastFetched = data.lastFetched.getTime();

    // Check if cache is fresh (less than TTL)
    if (now - lastFetched < CACHE_TTL) {
      return {
        id: data.symbol,
        name: data.name,
        country: data.country,
        countryCode: data.countryCode,
        price: data.price,
        dailyChange: data.dailyChange,
        dailyChangePercent: data.dailyChangePercent,
        chartData: JSON.parse(data.chartData),
        volume: data.volume || 0,
        monthlyChangePercent: data.monthlyChangePercent || 0,
        yearlyChangePercent: data.yearlyChangePercent || 0,
      };
    }

    return null;
  } catch (error) {
    console.error(`Error reading cache for ${symbol}:`, error);
    return null;
  }
}

/**
 * Save index data to cache
 */
async function saveIndexToCache(indexData: any) {
  try {
    const now = new Date();
    await db.insert(dukascopyIndexCache).values({
      symbol: indexData.id,
      name: indexData.name,
      country: indexData.country,
      countryCode: indexData.countryCode,
      price: indexData.price,
      dailyChange: indexData.dailyChange,
      dailyChangePercent: indexData.dailyChangePercent,
      volume: indexData.volume,
      monthlyChangePercent: indexData.monthlyChangePercent,
      yearlyChangePercent: indexData.yearlyChangePercent,
      chartData: JSON.stringify(indexData.chartData),
      lastFetched: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: dukascopyIndexCache.symbol,
      set: {
        name: indexData.name,
        country: indexData.country,
        countryCode: indexData.countryCode,
        price: indexData.price,
        dailyChange: indexData.dailyChange,
        dailyChangePercent: indexData.dailyChangePercent,
        volume: indexData.volume,
        monthlyChangePercent: indexData.monthlyChangePercent,
        yearlyChangePercent: indexData.yearlyChangePercent,
        chartData: JSON.stringify(indexData.chartData),
        lastFetched: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error(`Error saving cache for ${indexData.id}:`, error);
  }
}

/**
 * GET /api/markets/global
 * Fetch real-time global market indices data from Dukascopy with database caching
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    const results = await Promise.all(
      GLOBAL_INDICES.map(async (index) => {
        try {
          // Check cache first
          const cachedData = await getCachedIndexData(index.symbol);
          if (cachedData) {
            console.log(`Using cached data for ${index.symbol}`);
            return cachedData;
          }

          console.log(`Fetching fresh data for ${index.symbol}`);

          // Get real-time data for chart and current price
          const realtimeResult = await getRealTimeData({
            instrument: index.symbol,
            timeframe: "m15",
            last: 20,
          });

          if (!realtimeResult.success || !realtimeResult.data || !Array.isArray(realtimeResult.data) || realtimeResult.data.length === 0) {
            return null;
          }

          const realtimeData = realtimeResult.data as any[];
          const latestCandle = realtimeData[realtimeData.length - 1];
          const currentPrice = latestCandle.close;

          // Calculate daily change from real-time data
          const previousPrice = realtimeData[0].open;
          const dailyChange = currentPrice - previousPrice;
          const dailyChangePercent = (dailyChange / previousPrice) * 100;

          // Extract chart data (close prices)
          const chartData = realtimeData.map((candle: any) => candle.close);

          // Fetch historical data for monthly change (daily candles, last 30 days)
          let monthlyChangePercent = 0;
          try {
            const monthlyResult = await getHistoricalData({
              instrument: index.symbol,
              dates: { from: oneMonthAgo, to: now },
              timeframe: "d1",
            });

            if (monthlyResult.success && monthlyResult.data && Array.isArray(monthlyResult.data) && monthlyResult.data.length > 0) {
              const monthlyData = monthlyResult.data as any[];
              const monthAgoPrice = monthlyData[0].open;
              monthlyChangePercent = ((currentPrice - monthAgoPrice) / monthAgoPrice) * 100;
            }
          } catch (e) {
            // Silent fail for monthly data
          }

          // Fetch historical data for yearly change (daily candles, last 365 days)
          let yearlyChangePercent = 0;
          try {
            const yearlyResult = await getHistoricalData({
              instrument: index.symbol,
              dates: { from: oneYearAgo, to: now },
              timeframe: "d1",
            });

            if (yearlyResult.success && yearlyResult.data && Array.isArray(yearlyResult.data) && yearlyResult.data.length > 0) {
              const yearlyData = yearlyResult.data as any[];
              const yearAgoPrice = yearlyData[0].open;
              yearlyChangePercent = ((currentPrice - yearAgoPrice) / yearAgoPrice) * 100;
            }
          } catch (e) {
            // Silent fail for yearly data
          }

          const indexData = {
            id: index.symbol,
            name: index.name,
            country: index.country,
            countryCode: index.countryCode,
            price: currentPrice,
            dailyChange: dailyChange,
            dailyChangePercent: dailyChangePercent,
            chartData: chartData,
            volume: latestCandle.volume || 0,
            monthlyChangePercent: monthlyChangePercent,
            yearlyChangePercent: yearlyChangePercent,
          };

          // Save to cache
          await saveIndexToCache(indexData);

          return indexData;
        } catch (error) {
          console.error(`Error fetching ${index.symbol}:`, error);
          return null;
        }
      })
    );

    // Filter out indices with no data (null results)
    const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null && r.price > 0);

    return NextResponse.json({
      success: true,
      data: validResults,
      timestamp: new Date().toISOString(),
      cached: validResults.length > 0,
    });
  } catch (error: any) {
    console.error("Global markets API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch global markets data" },
      { status: 500 }
    );
  }
}
