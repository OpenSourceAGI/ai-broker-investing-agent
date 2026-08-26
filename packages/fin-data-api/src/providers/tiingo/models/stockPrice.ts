/**
 * Tiingo Stock Price Model
 * Converted from Python OpenBB tiingo models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const TiingoStockPriceQuerySchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
  interval: z
    .enum(['1min', '5min', '30min', '1hour', '4hour', '1day'])
    .default('1day')
    .describe('Price interval'),
});

export type TiingoStockPriceQuery = z.infer<typeof TiingoStockPriceQuerySchema>;

export const TiingoStockPriceDataSchema = z.object({
  date: z.string().describe('Date'),
  open: z.number().describe('Open price'),
  high: z.number().describe('High price'),
  low: z.number().describe('Low price'),
  close: z.number().describe('Close price'),
  volume: z.number().describe('Volume'),
  adj_close: z.number().optional().describe('Adjusted close'),
  adj_open: z.number().optional().describe('Adjusted open'),
  adj_high: z.number().optional().describe('Adjusted high'),
  adj_low: z.number().optional().describe('Adjusted low'),
  adj_volume: z.number().optional().describe('Adjusted volume'),
  dividend: z.number().optional().describe('Dividend'),
  split_factor: z.number().optional().describe('Split factor'),
});

export type TiingoStockPriceData = z.infer<typeof TiingoStockPriceDataSchema>;

export class TiingoStockPriceFetcher
  implements Fetcher<TiingoStockPriceQuery, TiingoStockPriceData>
{
  transformQuery(params: Partial<TiingoStockPriceQuery>): TiingoStockPriceQuery {
    return TiingoStockPriceQuerySchema.parse(params);
  }

  async extractData(
    query: TiingoStockPriceQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.tiingo_api_key;
    if (!apiKey) {
      throw new Error('Tiingo API key is required');
    }

    let url = `https://api.tiingo.com/tiingo/daily/${query.symbol}/prices?token=${apiKey}`;

    if (query.start_date) {
      const startDate =
        typeof query.start_date === 'string'
          ? query.start_date
          : query.start_date.toISOString().split('T')[0];
      url += `&startDate=${startDate}`;
    }

    if (query.end_date) {
      const endDate =
        typeof query.end_date === 'string'
          ? query.end_date
          : query.end_date.toISOString().split('T')[0];
      url += `&endDate=${endDate}`;
    }

    if (query.interval !== '1day') {
      url = url.replace('/daily/', '/iex/');
      url += `&resampleFreq=${query.interval}`;
    }

    const response = await makeRequest(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!Array.isArray(response)) {
      throw new Error('No data returned from Tiingo API');
    }

    return response;
  }

  transformData(_query: TiingoStockPriceQuery, data: any[]): TiingoStockPriceData[] {
    return data.map((item) =>
      TiingoStockPriceDataSchema.parse({
        date: item.date.split('T')[0],
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
        adj_close: item.adjClose,
        adj_open: item.adjOpen,
        adj_high: item.adjHigh,
        adj_low: item.adjLow,
        adj_volume: item.adjVolume,
        dividend: item.divCash,
        split_factor: item.splitFactor,
      })
    );
  }
}
