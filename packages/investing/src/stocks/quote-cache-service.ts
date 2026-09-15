/**
 * Stock Quote Cache Service
 * Handles caching of stock quotes, fundamentals, and historical data
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import type { NormalizedQuote } from "./unified-quote-service";

// The shared connection resolves to the Cloudflare D1 binding on Workers and to
// the same D1 database over its REST API everywhere else. Creating a driver
// here instead would hard-fail on Workers, where no other database is reachable.

// Cache TTL in milliseconds
const FUNDAMENTALS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
/** Default freshness window for a cached quote when the caller names none. */
export const QUOTE_CACHE_TTL = 60 * 1000; // 1 minute

export interface CachedQuote {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
}

export interface HistoricalQuote {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  adjustedClose?: number;
}

export class QuoteCacheService {
  /**
   * Round price to 2 decimal places for caching
   */
  private roundPrice(value: number | null | undefined): number | null {
    if (value === null || value === undefined || isNaN(value)) {
      return null;
    }
    return Math.round(value * 100) / 100;
  }

  /**
   * Get cached quote if available and still fresh.
   *
   * @param symbol - Ticker to look up; matched case-insensitively.
   * @param cacheTTL - Maximum age in milliseconds. Defaults to
   *   {@link QUOTE_CACHE_TTL}. A row older than this — or one with no
   *   timestamp, which is how rows written before the column existed read back
   *   — is treated as a miss so the caller refetches. Pass `Infinity` to accept
   *   a cached quote at any age.
   */
  async getCachedQuote(symbol: string, cacheTTL: number = QUOTE_CACHE_TTL): Promise<CachedQuote | null> {
    try {
      const cached = await db
        .select()
        .from(schema.stockQuoteCache)
        .where(eq(schema.stockQuoteCache.symbol, symbol.toUpperCase()))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const quote = cached[0];

      if (Number.isFinite(cacheTTL)) {
        const updatedAt = quote.updatedAt ? new Date(quote.updatedAt).getTime() : null;
        if (updatedAt === null || Number.isNaN(updatedAt) || Date.now() - updatedAt > cacheTTL) {
          return null;
        }
      }

      return {
        symbol: quote.symbol,
        price: quote.price,
        change: quote.change,
        changePercent: quote.changePercent,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        previousClose: quote.previousClose,
        volume: quote.volume,
      };
    } catch (error: any) {
      console.error(`[QuoteCache] Error reading cache for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Save quote to cache
   */
  async saveQuoteToCache(quote: NormalizedQuote): Promise<void> {
    try {
      const symbol = quote.symbol.toUpperCase();

      // Round all price values to 2 decimal places
      const roundedData = {
        symbol,
        price: this.roundPrice(quote.price) || 0,
        change: this.roundPrice(quote.change),
        changePercent: this.roundPrice(quote.changePercent),
        open: this.roundPrice(quote.open),
        high: this.roundPrice(quote.high),
        low: this.roundPrice(quote.low),
        previousClose: this.roundPrice(quote.previousClose),
        volume: quote.volume,
        updatedAt: new Date(),
      };

      await db
        .insert(schema.stockQuoteCache)
        .values(roundedData)
        .onConflictDoUpdate({
          target: schema.stockQuoteCache.symbol,
          set: {
            price: roundedData.price,
            change: roundedData.change,
            changePercent: roundedData.changePercent,
            open: roundedData.open,
            high: roundedData.high,
            low: roundedData.low,
            previousClose: roundedData.previousClose,
            volume: roundedData.volume,
            updatedAt: roundedData.updatedAt,
          },
        });
    } catch (error: any) {
      console.error(`[QuoteCache] Error saving quote for ${quote.symbol}:`, error.message);
    }
  }

  /**
   * Save multiple quotes to cache
   */
  async saveQuotesToCache(quotes: NormalizedQuote[]): Promise<void> {
    try {
      await Promise.all(quotes.map((quote) => this.saveQuoteToCache(quote)));
    } catch (error: any) {
      console.error(`[QuoteCache] Error saving quotes to cache:`, error.message);
    }
  }

  /**
   * Save historical quotes to cache
   */
  async saveHistoricalQuotes(symbol: string, quotes: HistoricalQuote[]): Promise<void> {
    if (!quotes || quotes.length === 0) {
      return;
    }

    try {
      const now = new Date();
      const symbolUpper = symbol.toUpperCase();

      // Filter out invalid quotes and prepare values
      const values = quotes
        .filter((quote) => {
          // Validate required fields
          if (!quote.date || !quote.open || !quote.high || !quote.low || !quote.close) {
            console.warn(`[QuoteCache] Skipping invalid quote for ${symbol} on ${quote.date}`);
            return false;
          }
          return true;
        })
        .map((quote) => ({
          id: `${symbolUpper}-${quote.date}`,
          symbol: symbolUpper,
          date: quote.date,
          open: this.roundPrice(quote.open) || 0,
          high: this.roundPrice(quote.high) || 0,
          low: this.roundPrice(quote.low) || 0,
          close: this.roundPrice(quote.close) || 0,
          volume: quote.volume || null,
          adjustedClose: this.roundPrice(quote.adjustedClose) || null,
          createdAt: now,
        }));

      if (values.length === 0) {
        return;
      }

      // Insert historical quotes in batches (ignore conflicts for existing dates)
      const batchSize = 50;
      for (let i = 0; i < values.length; i += batchSize) {
        const batch = values.slice(i, i + batchSize);

        for (const value of batch) {
          try {
            await db
              .insert(schema.stockHistoricalQuotes)
              .values(value)
              .onConflictDoNothing();
          } catch (insertError: any) {
            // Log individual insert errors but don't fail the entire batch
            console.error(
              `[QuoteCache] Failed to insert historical quote for ${symbol} on ${value.date}:`,
              insertError.message || insertError
            );
          }
        }
      }
    } catch (error: any) {
      console.error(
        `[QuoteCache] Error saving historical quotes for ${symbol}:`,
        error.message || error,
        error.stack
      );
    }
  }

  /**
   * Get cached historical quotes
   */
  async getCachedHistoricalQuotes(
    symbol: string,
    startDate?: string,
    endDate?: string
  ): Promise<HistoricalQuote[]> {
    try {
      const symbolUpper = symbol.toUpperCase();

      let query = db
        .select()
        .from(schema.stockHistoricalQuotes)
        .where(eq(schema.stockHistoricalQuotes.symbol, symbolUpper));

      const results = await query;

      // Filter by date range if provided
      let filtered = results;
      if (startDate) {
        filtered = filtered.filter((r) => r.date >= startDate);
      }
      if (endDate) {
        filtered = filtered.filter((r) => r.date <= endDate);
      }

      // Sort oldest-first. Row order from the database is not guaranteed, and
      // callers treat the first and last elements as the period bounds and feed
      // the series straight to a chart, both of which need chronological order.
      return filtered
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .map((r) => ({
          date: r.date,
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          volume: r.volume || undefined,
          adjustedClose: r.adjustedClose || undefined,
        }));
    } catch (error: any) {
      console.error(`[QuoteCache] Error reading historical quotes for ${symbol}:`, error.message);
      return [];
    }
  }

  /**
   * Save fundamentals to cache
   */
  async saveFundamentals(
    symbol: string,
    fundamentals: {
      peRatio?: number;
      eps?: number;
      dividendYield?: number;
      beta?: number;
      fiftyTwoWeekHigh?: number;
      fiftyTwoWeekLow?: number;
      fiftyDayAverage?: number;
      twoHundredDayAverage?: number;
      sharesOutstanding?: number;
      bookValue?: number;
      priceToBook?: number;
      trailingPE?: number;
      forwardPE?: number;
    }
  ): Promise<void> {
    try {
      const now = new Date();
      const symbolUpper = symbol.toUpperCase();

      // Round price-related fundamentals to 2 decimal places
      const roundedFundamentals = {
        symbol: symbolUpper,
        peRatio: this.roundPrice(fundamentals.peRatio),
        eps: this.roundPrice(fundamentals.eps),
        dividendYield: this.roundPrice(fundamentals.dividendYield),
        beta: this.roundPrice(fundamentals.beta),
        fiftyTwoWeekHigh: this.roundPrice(fundamentals.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: this.roundPrice(fundamentals.fiftyTwoWeekLow),
        fiftyDayAverage: this.roundPrice(fundamentals.fiftyDayAverage),
        twoHundredDayAverage: this.roundPrice(fundamentals.twoHundredDayAverage),
        sharesOutstanding: fundamentals.sharesOutstanding,
        bookValue: this.roundPrice(fundamentals.bookValue),
        priceToBook: this.roundPrice(fundamentals.priceToBook),
        trailingPE: this.roundPrice(fundamentals.trailingPE),
        forwardPE: this.roundPrice(fundamentals.forwardPE),
        lastFetched: now,
        createdAt: now,
        updatedAt: now,
      };

      await db
        .insert(schema.stockFundamentals)
        .values(roundedFundamentals)
        .onConflictDoUpdate({
          target: schema.stockFundamentals.symbol,
          set: {
            peRatio: roundedFundamentals.peRatio,
            eps: roundedFundamentals.eps,
            dividendYield: roundedFundamentals.dividendYield,
            beta: roundedFundamentals.beta,
            fiftyTwoWeekHigh: roundedFundamentals.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: roundedFundamentals.fiftyTwoWeekLow,
            fiftyDayAverage: roundedFundamentals.fiftyDayAverage,
            twoHundredDayAverage: roundedFundamentals.twoHundredDayAverage,
            sharesOutstanding: roundedFundamentals.sharesOutstanding,
            bookValue: roundedFundamentals.bookValue,
            priceToBook: roundedFundamentals.priceToBook,
            trailingPE: roundedFundamentals.trailingPE,
            forwardPE: roundedFundamentals.forwardPE,
            lastFetched: now,
            updatedAt: now,
          },
        });
    } catch (error: any) {
      console.error(`[QuoteCache] Error saving fundamentals for ${symbol}:`, error.message);
    }
  }

  /**
   * Get cached fundamentals
   */
  async getCachedFundamentals(symbol: string) {
    try {
      const cached = await db
        .select()
        .from(schema.stockFundamentals)
        .where(eq(schema.stockFundamentals.symbol, symbol.toUpperCase()))
        .limit(1);

      if (cached.length === 0) {
        return null;
      }

      const fundamentals = cached[0];
      const now = new Date();
      const lastFetched = new Date(fundamentals.lastFetched);
      const age = now.getTime() - lastFetched.getTime();

      // Check if cache is still fresh
      if (age > FUNDAMENTALS_CACHE_TTL) {
        return null;
      }

      return fundamentals;
    } catch (error: any) {
      console.error(`[QuoteCache] Error reading fundamentals for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<void> {
    // Not implemented: reads already discard entries past their TTL, so nothing
    // depends on a sweep. (The previous body referenced an undeclared
    // QUOTE_CACHE_TTL and threw a ReferenceError when called.)
  }
}

// Export singleton instance
export const quoteCacheService = new QuoteCacheService();
export default quoteCacheService;
