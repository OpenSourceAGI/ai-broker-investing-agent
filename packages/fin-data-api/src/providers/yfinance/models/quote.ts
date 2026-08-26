/**
 * Yahoo Finance Quote Model
 * Converted from Python OpenBB yfinance models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const YFinanceQuoteQuerySchema = z.object({
  symbol: z.string().describe('Stock symbol(s), comma-separated'),
});

export type YFinanceQuoteQuery = z.infer<typeof YFinanceQuoteQuerySchema>;

export const YFinanceQuoteDataSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  name: z.string().optional().describe('Company name'),
  price: z.number().describe('Current price'),
  change: z.number().optional().describe('Price change'),
  percent_change: z.number().optional().describe('Percent change'),
  volume: z.number().optional().describe('Trading volume'),
  market_cap: z.number().optional().describe('Market capitalization'),
  pe_ratio: z.number().optional().describe('P/E ratio'),
  dividend_yield: z.number().optional().describe('Dividend yield'),
  week_52_high: z.number().optional().describe('52-week high'),
  week_52_low: z.number().optional().describe('52-week low'),
  avg_volume: z.number().optional().describe('Average volume'),
  open: z.number().optional().describe('Open price'),
  previous_close: z.number().optional().describe('Previous close'),
  day_high: z.number().optional().describe('Day high'),
  day_low: z.number().optional().describe('Day low'),
});

export type YFinanceQuoteData = z.infer<typeof YFinanceQuoteDataSchema>;

export class YFinanceQuoteFetcher implements Fetcher<YFinanceQuoteQuery, YFinanceQuoteData> {
  transformQuery(params: Partial<YFinanceQuoteQuery>): YFinanceQuoteQuery {
    return YFinanceQuoteQuerySchema.parse(params);
  }

  async extractData(
    query: YFinanceQuoteQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const symbols = query.symbol.split(',').map((s) => s.trim());
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}`;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    const response = await makeRequest(url, { headers });

    if (!response.quoteResponse?.result) {
      throw new Error('No data returned from Yahoo Finance API');
    }

    return response.quoteResponse.result;
  }

  transformData(_query: YFinanceQuoteQuery, data: any[]): YFinanceQuoteData[] {
    return data.map((item) =>
      YFinanceQuoteDataSchema.parse({
        symbol: item.symbol,
        name: item.longName || item.shortName,
        price: item.regularMarketPrice,
        change: item.regularMarketChange,
        percent_change: item.regularMarketChangePercent,
        volume: item.regularMarketVolume,
        market_cap: item.marketCap,
        pe_ratio: item.trailingPE || item.forwardPE,
        dividend_yield: item.dividendYield,
        week_52_high: item.fiftyTwoWeekHigh,
        week_52_low: item.fiftyTwoWeekLow,
        avg_volume: item.averageDailyVolume3Month,
        open: item.regularMarketOpen,
        previous_close: item.regularMarketPreviousClose,
        day_high: item.regularMarketDayHigh,
        day_low: item.regularMarketDayLow,
      })
    );
  }
}
