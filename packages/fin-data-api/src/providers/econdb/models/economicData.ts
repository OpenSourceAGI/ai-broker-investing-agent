/**
 * EconDB Economic Data Model
 * Converted from Python OpenBB econdb models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const EconDBEconomicDataQuerySchema = z.object({
  ticker: z.string().describe('EconDB ticker'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
  transform: z
    .enum(['diff', 'pch', 'log', 'normalize'])
    .optional()
    .describe('Data transformation'),
});

export type EconDBEconomicDataQuery = z.infer<typeof EconDBEconomicDataQuerySchema>;

export const EconDBEconomicDataDataSchema = z.object({
  date: z.string().describe('Date'),
  value: z.number().nullable().describe('Value'),
  ticker: z.string().describe('Ticker'),
});

export type EconDBEconomicDataData = z.infer<typeof EconDBEconomicDataDataSchema>;

export class EconDBEconomicDataFetcher
  implements Fetcher<EconDBEconomicDataQuery, EconDBEconomicDataData>
{
  transformQuery(params: Partial<EconDBEconomicDataQuery>): EconDBEconomicDataQuery {
    return EconDBEconomicDataQuerySchema.parse(params);
  }

  async extractData(
    query: EconDBEconomicDataQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.econdb_api_key;

    let url = `https://www.econdb.com/api/series/${query.ticker}/?format=json`;

    if (apiKey) {
      url += `&api_key=${apiKey}`;
    }

    if (query.start_date) {
      const startDate =
        typeof query.start_date === 'string'
          ? query.start_date
          : query.start_date.toISOString().split('T')[0];
      url += `&from=${startDate}`;
    }

    if (query.end_date) {
      const endDate =
        typeof query.end_date === 'string'
          ? query.end_date
          : query.end_date.toISOString().split('T')[0];
      url += `&to=${endDate}`;
    }

    if (query.transform) {
      url += `&transform=${query.transform}`;
    }

    const response = await makeRequest(url);

    if (!response.data) {
      throw new Error('No data returned from EconDB API');
    }

    const results: any[] = [];
    for (let i = 0; i < response.data.dates.length; i++) {
      results.push({
        date: response.data.dates[i],
        value: response.data.values[i],
        ticker: query.ticker,
      });
    }

    return results;
  }

  transformData(_query: EconDBEconomicDataQuery, data: any[]): EconDBEconomicDataData[] {
    return data.map((item) => EconDBEconomicDataDataSchema.parse(item));
  }
}
