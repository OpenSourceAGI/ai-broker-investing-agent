/**
 * FINRA Short Interest Model
 * Converted from Python OpenBB finra models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';

export const FINRAShortInterestQuerySchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
});

export type FINRAShortInterestQuery = z.infer<typeof FINRAShortInterestQuerySchema>;

export const FINRAShortInterestDataSchema = z.object({
  settlement_date: z.string().describe('Settlement date'),
  symbol: z.string().describe('Stock symbol'),
  short_interest: z.number().describe('Short interest shares'),
  avg_daily_volume: z.number().optional().describe('Average daily volume'),
  days_to_cover: z.number().optional().describe('Days to cover'),
});

export type FINRAShortInterestData = z.infer<typeof FINRAShortInterestDataSchema>;

export class FINRAShortInterestFetcher
  implements Fetcher<FINRAShortInterestQuery, FINRAShortInterestData>
{
  transformQuery(params: Partial<FINRAShortInterestQuery>): FINRAShortInterestQuery {
    return FINRAShortInterestQuerySchema.parse(params);
  }

  async extractData(
    query: FINRAShortInterestQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    // FINRA data access requires specific parsing
    // Placeholder implementation
    return [
      {
        settlement_date: '2024-01-15',
        symbol: query.symbol,
        short_interest: 1000000,
        avg_daily_volume: 500000,
        days_to_cover: 2.0,
        note: 'FINRA data parsing required',
      },
    ];
  }

  transformData(_query: FINRAShortInterestQuery, data: any[]): FINRAShortInterestData[] {
    return data.map((item) => FINRAShortInterestDataSchema.parse(item));
  }
}
