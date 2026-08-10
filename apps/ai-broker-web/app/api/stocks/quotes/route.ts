import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/packages/investing/src/stocks/unified-quote-service";
import { yahooFinanceWrapper as yahooFinance } from "@/packages/investing/src/stocks/yahoo-finance-wrapper";
import { quoteCacheService } from "@/packages/investing/src/stocks/quote-cache-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calculate weekly change from historical data (last 5 trading days)
 */
async function getWeeklyChange(
  symbol: string,
): Promise<{ change: number; changePercent: number } | null> {
  try {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 7); // Go back 7 calendar days to ensure we get 5 trading days

    const result = await yahooFinance.getHistorical(symbol, {
      period1: fiveDaysAgo,
      period2: new Date(),
      interval: "1d",
    });

    if (result.success && result.data && result.data.length >= 2) {
      const oldestPrice = result.data[0].close;
      const latestPrice = result.data[result.data.length - 1].close;
      const change = latestPrice - oldestPrice;
      const changePercent = (change / oldestPrice) * 100;

      return {
        change: Number(change.toFixed(2)),
        changePercent: Math.round(changePercent), // Round to whole number
      };
    }
  } catch (error) {
    // Silent fail
  }
  return null;
}

/**
 * Calculate monthly change from historical data
 */
async function getMonthlyChange(
  symbol: string,
): Promise<{ change: number; changePercent: number } | null> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await yahooFinance.getHistorical(symbol, {
      period1: thirtyDaysAgo,
      period2: new Date(),
      interval: "1d",
    });

    if (result.success && result.data && result.data.length >= 2) {
      const oldestPrice = result.data[0].close;
      const latestPrice = result.data[result.data.length - 1].close;
      const change = latestPrice - oldestPrice;
      const changePercent = (change / oldestPrice) * 100;

      // Save historical data to cache
      const historicalQuotes = result.data.map((d: any) => ({
        date: d.date.toISOString().split("T")[0], // YYYY-MM-DD
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }));
      await quoteCacheService.saveHistoricalQuotes(symbol, historicalQuotes);

      return {
        change: Number(change.toFixed(2)),
        changePercent: Math.round(changePercent), // Round to whole number
      };
    }
  } catch (error) {
    // Silent fail
  }
  return null;
}

/**
 * Calculate yearly change from historical data
 */
async function getYearlyChange(
  symbol: string,
): Promise<{ change: number; changePercent: number } | null> {
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const result = await yahooFinance.getHistorical(symbol, {
      period1: oneYearAgo,
      period2: new Date(),
      interval: "1d",
    });

    if (result.success && result.data && result.data.length >= 2) {
      const oldestPrice = result.data[0].close;
      const latestPrice = result.data[result.data.length - 1].close;
      const change = latestPrice - oldestPrice;
      const changePercent = (change / oldestPrice) * 100;

      // Save historical data to cache
      const historicalQuotes = result.data.map((d: any) => ({
        date: d.date.toISOString().split("T")[0], // YYYY-MM-DD
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      }));
      await quoteCacheService.saveHistoricalQuotes(symbol, historicalQuotes);

      return {
        change: Number(change.toFixed(2)),
        changePercent: Math.round(changePercent), // Round to whole number
      };
    }
  } catch (error) {
    // Silent fail
  }
  return null;
}

/**
 * GET /api/stocks/quotes?symbols=AAPL,MSFT,GOOGL&live=true&cacheTTL=300000&skipHistorical=true
 * Get real-time quotes for multiple stock symbols with weekly, monthly and yearly change data
 * @param symbols - Comma-separated list of stock symbols
 * @param live - Optional: set to 'true' to bypass cache and get fresh data (default: false, uses cache)
 * @param cacheTTL - Optional: cache TTL in milliseconds (default: 60000 = 1 minute)
 * @param skipHistorical - Optional: set to 'true' to skip weekly/monthly/yearly calculations (faster for tickers)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get("symbols");
    const liveParam = searchParams.get("live");
    const cacheTTLParam = searchParams.get("cacheTTL");
    const skipHistoricalParam = searchParams.get("skipHistorical");
    const useCache = liveParam !== "true"; // Use cache by default, bypass if live=true
    const cacheTTL = cacheTTLParam ? parseInt(cacheTTLParam, 10) : undefined;
    const skipHistorical = skipHistoricalParam === "true";

    if (!symbolsParam) {
      return NextResponse.json(
        { error: "symbols parameter is required" },
        { status: 400 },
      );
    }

    const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase());

    // Use unified quote service with fallback
    const result = await getQuotes(symbols, { useCache, cacheTTL });

    if (!result.success || !result.data) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to fetch quotes" },
        { status: 400 },
      );
    }

    // Enrich quotes with weekly, monthly and yearly change data (skip if requested for faster response)
    const enrichedQuotes = await Promise.all(
      result.data.quotes.map(async (quote) => {
        let weeklyData = null;
        let monthlyData = null;
        let yearlyData = null;

        // Only fetch historical data if not skipped (for ticker performance)
        if (!skipHistorical) {
          [weeklyData, monthlyData, yearlyData] = await Promise.all([
            getWeeklyChange(quote.symbol),
            getMonthlyChange(quote.symbol),
            getYearlyChange(quote.symbol),
          ]);
        }

        return {
          symbol: quote.symbol,
          shortName: quote.name,
          longName: quote.name,
          regularMarketPrice: quote.price,
          regularMarketChange: quote.change,
          regularMarketChangePercent: quote.changePercent,
          regularMarketOpen: quote.open,
          regularMarketDayHigh: quote.high,
          regularMarketDayLow: quote.low,
          regularMarketPreviousClose: quote.previousClose,
          regularMarketVolume: quote.volume,
          marketCap: quote.marketCap,
          fiftyTwoWeekHigh: null,
          fiftyTwoWeekLow: null,
          weeklyChange: weeklyData?.change || 0,
          weeklyChangePercent: weeklyData?.changePercent || 0,
          monthlyChange: monthlyData?.change || 0,
          monthlyChangePercent: monthlyData?.changePercent || 0,
          yearlyChange: yearlyData?.change || 0,
          yearlyChangePercent: yearlyData?.changePercent || 0,
          source: quote.source,
          timestamp: quote.timestamp,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      data: enrichedQuotes,
      sources: result.data.source,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch quotes" },
      { status: 500 },
    );
  }
}
