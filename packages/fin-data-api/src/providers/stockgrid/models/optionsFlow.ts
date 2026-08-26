/**
 * Stockgrid Options Flow Model
 * Converted from Python OpenBB stockgrid models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const StockgridOptionsFlowQuerySchema = z.object({
  symbol: z.string().optional().describe('Stock symbol to filter'),
  min_premium: z.number().optional().describe('Minimum premium'),
  limit: z.number().default(100).describe('Number of results'),
});

export type StockgridOptionsFlowQuery = z.infer<typeof StockgridOptionsFlowQuerySchema>;

export const StockgridOptionsFlowDataSchema = z.object({
  timestamp: z.string().describe('Timestamp'),
  symbol: z.string().describe('Stock symbol'),
  strike: z.number().describe('Strike price'),
  expiration: z.string().describe('Expiration date'),
  option_type: z.string().describe('Call or Put'),
  premium: z.number().describe('Premium amount'),
  volume: z.number().describe('Volume'),
  sentiment: z.string().optional().describe('Sentiment indicator'),
});

export type StockgridOptionsFlowData = z.infer<typeof StockgridOptionsFlowDataSchema>;

export class StockgridOptionsFlowFetcher
  implements Fetcher<StockgridOptionsFlowQuery, StockgridOptionsFlowData>
{
  transformQuery(params: Partial<StockgridOptionsFlowQuery>): StockgridOptionsFlowQuery {
    return StockgridOptionsFlowQuerySchema.parse(params);
  }

  async extractData(
    query: StockgridOptionsFlowQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.stockgrid_api_key;
    if (!apiKey) {
      throw new Error('Stockgrid API key is required');
    }

    let url = `https://api.stockgrid.io/optionsflow?apikey=${apiKey}&limit=${query.limit}`;

    if (query.symbol) {
      url += `&symbol=${query.symbol}`;
    }

    if (query.min_premium) {
      url += `&min_premium=${query.min_premium}`;
    }

    const response = await makeRequest(url);

    if (!Array.isArray(response)) {
      throw new Error('No data returned from Stockgrid API');
    }

    return response;
  }

  transformData(_query: StockgridOptionsFlowQuery, data: any[]): StockgridOptionsFlowData[] {
    return data.map((item) =>
      StockgridOptionsFlowDataSchema.parse({
        timestamp: item.timestamp || item.time,
        symbol: item.symbol,
        strike: item.strike,
        expiration: item.expiration,
        option_type: item.option_type || item.type,
        premium: item.premium,
        volume: item.volume,
        sentiment: item.sentiment,
      })
    );
  }
}
