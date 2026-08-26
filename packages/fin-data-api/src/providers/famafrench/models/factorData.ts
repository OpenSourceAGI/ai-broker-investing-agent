/**
 * Fama-French Factor Data Model
 * Converted from Python OpenBB famafrench models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';

export const FamaFrenchFactorDataQuerySchema = z.object({
  factor: z
    .string()
    .default('F-F_Research_Data_Factors')
    .describe('Factor dataset name'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
  frequency: z.enum(['daily', 'monthly', 'annual']).default('monthly').describe('Data frequency'),
});

export type FamaFrenchFactorDataQuery = z.infer<typeof FamaFrenchFactorDataQuerySchema>;

export const FamaFrenchFactorDataDataSchema = z.object({
  date: z.string().describe('Date'),
  mkt_rf: z.number().optional().describe('Market return minus risk-free rate'),
  smb: z.number().optional().describe('Small minus big'),
  hml: z.number().optional().describe('High minus low'),
  rf: z.number().optional().describe('Risk-free rate'),
  mom: z.number().optional().describe('Momentum factor'),
});

export type FamaFrenchFactorDataData = z.infer<typeof FamaFrenchFactorDataDataSchema>;

export class FamaFrenchFactorDataFetcher
  implements Fetcher<FamaFrenchFactorDataQuery, FamaFrenchFactorDataData>
{
  transformQuery(params: Partial<FamaFrenchFactorDataQuery>): FamaFrenchFactorDataQuery {
    return FamaFrenchFactorDataQuerySchema.parse(params);
  }

  async extractData(
    _query: FamaFrenchFactorDataQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    // Note: This requires ZIP file download and CSV parsing
    // Placeholder implementation
    return [
      {
        date: '2024-01',
        mkt_rf: 1.5,
        smb: 0.3,
        hml: 0.2,
        rf: 0.1,
        note: 'ZIP/CSV parsing required',
      },
    ];
  }

  transformData(
    query: FamaFrenchFactorDataQuery,
    data: any[]
  ): FamaFrenchFactorDataData[] {
    return data
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
      })
      .map((item) => FamaFrenchFactorDataDataSchema.parse(item));
  }
}
