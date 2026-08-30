/**
 * Intrinio Stock Price Model
 * Converted from Python OpenBB intrinio models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const IntrinioStockPriceQuerySchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
  interval: z.enum(['1min', '5min', '1hour', 'daily']).default('daily').describe('Interval'),
  limit: z.number().default(100).describe('Number of results'),
});

export type IntrinioStockPriceQuery = z.infer<typeof IntrinioStockPriceQuerySchema>;

export const IntrinioStockPriceDataSchema = z.object({
  date: z.string().describe('Date'),
  open: z.number().describe('Open price'),
  high: z.number().describe('High price'),
  low: z.number().describe('Low price'),
  close: z.number().describe('Close price'),
  volume: z.number().describe('Volume'),
  adj_close: z.number().optional().describe('Adjusted close'),
});

export type IntrinioStockPriceData = z.infer<typeof IntrinioStockPriceDataSchema>;

export class IntrinioStockPriceFetcher
  implements Fetcher<IntrinioStockPriceQuery, IntrinioStockPriceData>
{
  transformQuery(params: Partial<IntrinioStockPriceQuery>): IntrinioStockPriceQuery {
    return IntrinioStockPriceQuerySchema.parse(params);
  }

  async extractData(
    query: IntrinioStockPriceQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.intrinio_api_key;
    if (!apiKey) {
      throw new Error('Intrinio API key is required');
    }

    const params: Record<string, string> = {
      api_key: apiKey,
      page_size: query.limit.toString(),
    };

    if (query.start_date) {
      params.start_date =
        typeof query.start_date === 'string'
          ? query.start_date
          : query.start_date.toISOString().split('T')[0];
    }

    if (query.end_date) {
      params.end_date =
        typeof query.end_date === 'string'
          ? query.end_date
          : query.end_date.toISOString().split('T')[0];
    }

    const queryString = new URLSearchParams(params).toString();
    const url = `https://api-v2.intrinio.com/securities/${query.symbol}/prices?${queryString}`;

    const response = await makeRequest(url);

    if (!response.stock_prices) {
      throw new Error('No data returned from Intrinio API');
    }

    return response.stock_prices;
  }

  transformData(_query: IntrinioStockPriceQuery, data: any[]): IntrinioStockPriceData[] {
    return data.map((item) =>
      IntrinioStockPriceDataSchema.parse({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
        adj_close: item.adj_close,
      })
    );
  }
}
