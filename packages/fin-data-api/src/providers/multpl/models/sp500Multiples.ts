/**
 * Multpl S&P 500 Multiples Model
 * Converted from Python OpenBB multpl models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

const URL_DICT: Record<string, string> = {
  shiller_pe_month: 'shiller-pe/table/by-month',
  shiller_pe_year: 'shiller-pe/table/by-year',
  pe_year: 's-p-500-pe-ratio/table/by-year',
  pe_month: 's-p-500-pe-ratio/table/by-month',
  dividend_year: 's-p-500-dividend/table/by-year',
  dividend_month: 's-p-500-dividend/table/by-month',
  earnings_year: 's-p-500-earnings/table/by-year',
  earnings_month: 's-p-500-earnings/table/by-month',
};

export const MultplSP500MultiplesQuerySchema = z.object({
  series_name: z
    .string()
    .default('shiller_pe_month')
    .describe('Series name to retrieve'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
});

export type MultplSP500MultiplesQuery = z.infer<typeof MultplSP500MultiplesQuerySchema>;

export const MultplSP500MultiplesDataSchema = z.object({
  date: z.string().describe('Date'),
  value: z.number().describe('Value'),
  name: z.string().describe('Series name'),
});

export type MultplSP500MultiplesData = z.infer<typeof MultplSP500MultiplesDataSchema>;

export class MultplSP500MultiplesFetcher
  implements Fetcher<MultplSP500MultiplesQuery, MultplSP500MultiplesData>
{
  transformQuery(params: Partial<MultplSP500MultiplesQuery>): MultplSP500MultiplesQuery {
    return MultplSP500MultiplesQuerySchema.parse(params);
  }

  async extractData(
    query: MultplSP500MultiplesQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const urlPath = URL_DICT[query.series_name];
    if (!urlPath) {
      throw new Error(`Invalid series name: ${query.series_name}`);
    }

    const url = `https://www.multpl.com/${urlPath}`;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    await makeRequest(url, { headers });

    // Note: This requires HTML table parsing
    // Placeholder implementation
    return [
      {
        date: '2024-01-01',
        value: 25.5,
        name: query.series_name,
        note: 'HTML table parsing required - implement with cheerio or similar library',
      },
    ];
  }

  transformData(query: MultplSP500MultiplesQuery, data: any[]): MultplSP500MultiplesData[] {
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
      .map((item) => MultplSP500MultiplesDataSchema.parse(item));
  }
}
