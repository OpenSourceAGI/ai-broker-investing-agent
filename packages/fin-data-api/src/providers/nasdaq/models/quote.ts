/**
 * NASDAQ Quote Model
 * Converted from Python OpenBB nasdaq models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const NasdaqQuoteQuerySchema = z.object({
  symbol: z.string().describe('Stock symbol'),
});

export type NasdaqQuoteQuery = z.infer<typeof NasdaqQuoteQuerySchema>;

export const NasdaqQuoteDataSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  name: z.string().optional().describe('Company name'),
  last_price: z.number().describe('Last price'),
  change: z.number().optional().describe('Price change'),
  percent_change: z.number().optional().describe('Percent change'),
  high: z.number().optional().describe('Day high'),
  low: z.number().optional().describe('Day low'),
  volume: z.number().optional().describe('Volume'),
  timestamp: z.string().optional().describe('Quote timestamp'),
});

export type NasdaqQuoteData = z.infer<typeof NasdaqQuoteDataSchema>;

export class NasdaqQuoteFetcher implements Fetcher<NasdaqQuoteQuery, NasdaqQuoteData> {
  transformQuery(params: Partial<NasdaqQuoteQuery>): NasdaqQuoteQuery {
    return NasdaqQuoteQuerySchema.parse(params);
  }

  async extractData(
    query: NasdaqQuoteQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const url = `https://api.nasdaq.com/api/quote/${query.symbol}/info?assetclass=stocks`;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      Accept: 'application/json',
    };

    const response = await makeRequest(url, { headers });

    if (!response.data) {
      throw new Error('No data returned from NASDAQ API');
    }

    return [response.data];
  }

  transformData(query: NasdaqQuoteQuery, data: any[]): NasdaqQuoteData[] {
    return data.map((item) =>
      NasdaqQuoteDataSchema.parse({
        symbol: query.symbol,
        name: item.companyName,
        last_price: parseFloat(item.primaryData?.lastSalePrice?.replace('$', '') || '0'),
        change: parseFloat(item.primaryData?.netChange || '0'),
        percent_change: parseFloat(
          item.primaryData?.percentageChange?.replace('%', '') || '0'
        ),
        high: parseFloat(item.keyStats?.High?.value?.replace('$', '') || '0'),
        low: parseFloat(item.keyStats?.Low?.value?.replace('$', '') || '0'),
        volume: parseInt(item.keyStats?.Volume?.value?.replace(/,/g, '') || '0'),
        timestamp: item.primaryData?.lastTradeTimestamp,
      })
    );
  }
}
