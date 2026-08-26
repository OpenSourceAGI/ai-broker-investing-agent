/**
 * CBOE Index Data Model
 * Converted from Python OpenBB cboe models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const CBOEIndexQuerySchema = z.object({
  symbol: z.string().describe('Index symbol (e.g., VIX, SPX)'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
  interval: z.enum(['1d', '1m']).default('1d').describe('Data interval'),
});

export type CBOEIndexQuery = z.infer<typeof CBOEIndexQuerySchema>;

export const CBOEIndexDataSchema = z.object({
  date: z.string().describe('Date'),
  open: z.number().optional().describe('Open price'),
  high: z.number().optional().describe('High price'),
  low: z.number().optional().describe('Low price'),
  close: z.number().describe('Close price'),
  volume: z.number().optional().describe('Volume'),
});

export type CBOEIndexData = z.infer<typeof CBOEIndexDataSchema>;

export class CBOEIndexFetcher implements Fetcher<CBOEIndexQuery, CBOEIndexData> {
  transformQuery(params: Partial<CBOEIndexQuery>): CBOEIndexQuery {
    return CBOEIndexQuerySchema.parse(params);
  }

  async extractData(
    query: CBOEIndexQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const symbol = query.symbol.toUpperCase();
    const url = `https://cdn.cboe.com/api/global/delayed_quotes/historical/${symbol}.json`;

    const response = await makeRequest(url);

    if (!response || !response.data) {
      throw new Error('No data returned from CBOE API');
    }

    return response.data;
  }

  transformData(query: CBOEIndexQuery, data: any[]): CBOEIndexData[] {
    return data
      .map((item) =>
        CBOEIndexDataSchema.parse({
          date: item.date,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
        })
      )
      .filter((item) => {
        if (!query.start_date && !query.end_date) return true;
        const itemDate = new Date(item.date);
        const startDate = query.start_date
          ? typeof query.start_date === 'string'
            ? new Date(query.start_date)
            : query.start_date
          : new Date(0);
        const endDate = query.end_date
          ? typeof query.end_date === 'string'
            ? new Date(query.end_date)
            : query.end_date
          : new Date();
        return itemDate >= startDate && itemDate <= endDate;
      });
  }
}
