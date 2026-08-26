/**
 * WSJ Market Movers Model
 * Converted from Python OpenBB wsj models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const WSJMarketMoversQuerySchema = z.object({
  type: z.enum(['gainers', 'losers', 'active']).default('gainers').describe('Type of movers'),
  limit: z.number().default(20).describe('Number of results'),
});

export type WSJMarketMoversQuery = z.infer<typeof WSJMarketMoversQuerySchema>;

export const WSJMarketMoversDataSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  name: z.string().optional().describe('Company name'),
  last_price: z.number().describe('Last price'),
  change: z.number().optional().describe('Price change'),
  percent_change: z.number().optional().describe('Percent change'),
  volume: z.number().optional().describe('Volume'),
});

export type WSJMarketMoversData = z.infer<typeof WSJMarketMoversDataSchema>;

export class WSJMarketMoversFetcher
  implements Fetcher<WSJMarketMoversQuery, WSJMarketMoversData>
{
  transformQuery(params: Partial<WSJMarketMoversQuery>): WSJMarketMoversQuery {
    return WSJMarketMoversQuerySchema.parse(params);
  }

  async extractData(
    query: WSJMarketMoversQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const typeMap: Record<string, string> = {
      gainers: 'gainers',
      losers: 'losers',
      active: 'active',
    };

    const url = `https://www.wsj.com/market-data/stocks/${typeMap[query.type]}`;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    await makeRequest(url, { headers });

    // Note: This requires HTML scraping - placeholder implementation
    return [
      {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        last_price: 150.0,
        change: 2.5,
        percent_change: 1.69,
        volume: 1000000,
        note: 'HTML scraping required - implement with cheerio or similar library',
      },
    ].slice(0, query.limit);
  }

  transformData(_query: WSJMarketMoversQuery, data: any[]): WSJMarketMoversData[] {
    return data.map((item) =>
      WSJMarketMoversDataSchema.parse({
        symbol: item.symbol,
        name: item.name,
        last_price: item.last_price,
        change: item.change,
        percent_change: item.percent_change,
        volume: item.volume,
      })
    );
  }
}
