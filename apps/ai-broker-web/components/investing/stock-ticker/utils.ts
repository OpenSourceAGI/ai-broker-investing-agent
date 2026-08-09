import type { TickerData } from "./types";
import { defaultWatchlist } from "./constants";

// Create a lookup map for symbol -> name from constants
const symbolNameMap = new Map(
  defaultWatchlist.map((item) => [item.symbol, item.name]),
);

export function getStockLogoUrl(symbol: string): string {
  return `https://img.logo.dev/ticker/${symbol.replace("^", "")}?token=pk_TttrZhYwSReZxFePkXo-Bg&size=48&retina=true`;
}

export async function fetchTickerData(
  symbols: string[],
  retryCount = 0,
): Promise<TickerData[]> {
  const maxRetries = 2;

  // Only fetch on client side
  if (typeof window === "undefined") {
    return [];
  }

  try {
    // Use 5-minute cache for banner, skip historical data for faster response
    const response = await fetch(
      `/api/stocks/quotes?symbols=${symbols.join(",")}&cacheTTL=300000&skipHistorical=false`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.error(`Stock ticker fetch failed: HTTP ${response.status}`);

      // Retry on server errors
      if (retryCount < maxRetries && response.status >= 500) {
        console.log(
          `Retrying in 2s... (attempt ${retryCount + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return fetchTickerData(symbols, retryCount + 1);
      }
      return [];
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      console.error("Failed to fetch ticker data:", result.error);

      // Retry on data errors
      if (retryCount < maxRetries) {
        console.log(
          `Retrying in 2s... (attempt ${retryCount + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return fetchTickerData(symbols, retryCount + 1);
      }
      return [];
    }

    return result.data.map((quote: any) => {
      const price = quote.regularMarketPrice || 0;
      const change = quote.regularMarketChange || 0;
      const changePercent = quote.regularMarketChangePercent || 0;

      // Use real weekly, monthly and yearly change from API (calculated from historical data)
      const weeklyChange = quote.weeklyChange;
      const weeklyChangePercent = quote.weeklyChangePercent;
      const monthlyChange = quote.monthlyChange || 0;
      const monthlyChangePercent = quote.monthlyChangePercent || 0;
      const yearlyChange = quote.yearlyChange || 0;
      const yearlyChangePercent = quote.yearlyChangePercent || 0;

      // Get symbol
      const symbol = quote.symbol || "N/A";

      // Override with name from constants if available, otherwise use API name
      const name =
        symbolNameMap.get(symbol) ||
        quote.shortName ||
        quote.longName ||
        "Unknown";

      // Determine type: indices start with ^, commodities end with =F
      const type =
        symbol.startsWith("^") || symbol.endsWith("=F") ? "index" : "stock";

      return {
        symbol,
        name,
        price: Number(price.toFixed(2)),
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        weeklyChange:
          weeklyChange !== undefined
            ? Number(weeklyChange.toFixed(2))
            : undefined,
        weeklyChangePercent: weeklyChangePercent, // Already rounded from API
        monthlyChange: Number(monthlyChange.toFixed(2)),
        monthlyChangePercent: monthlyChangePercent, // Already rounded from API
        yearlyChange: Number(yearlyChange.toFixed(2)),
        yearlyChangePercent: yearlyChangePercent, // Already rounded from API
        high: quote.regularMarketDayHigh || price,
        low: quote.regularMarketDayLow || price,
        volume: quote.regularMarketVolume
          ? quote.regularMarketVolume >= 1e9
            ? `${(quote.regularMarketVolume / 1e9).toFixed(1)}B`
            : `${(quote.regularMarketVolume / 1e6).toFixed(1)}M`
          : "N/A",
        type,
        source: quote.source,
      };
    });
  } catch (error) {
    console.error("Error fetching ticker data:", error);

    // Retry on network errors
    if (retryCount < maxRetries) {
      console.log(
        `Network error, retrying in 2s... (attempt ${retryCount + 1}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return fetchTickerData(symbols, retryCount + 1);
    }
    return [];
  }
}
