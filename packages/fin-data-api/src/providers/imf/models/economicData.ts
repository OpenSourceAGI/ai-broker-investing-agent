/**
 * IMF Economic Data Model
 * Converted from Python OpenBB imf models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const IMFEconomicDataQuerySchema = z.object({
  country: z.string().describe('Country code (ISO 2-letter)'),
  indicator: z.string().describe('Indicator code'),
  start_year: z.number().optional().describe('Start year'),
  end_year: z.number().optional().describe('End year'),
  frequency: z.enum(['A', 'Q', 'M']).default('A').describe('Frequency (A=Annual, Q=Quarterly, M=Monthly)'),
});

export type IMFEconomicDataQuery = z.infer<typeof IMFEconomicDataQuerySchema>;

export const IMFEconomicDataDataSchema = z.object({
  date: z.string().describe('Date/Period'),
  value: z.number().nullable().describe('Indicator value'),
  country: z.string().describe('Country code'),
  indicator: z.string().describe('Indicator code'),
});

export type IMFEconomicDataData = z.infer<typeof IMFEconomicDataDataSchema>;

export class IMFEconomicDataFetcher
  implements Fetcher<IMFEconomicDataQuery, IMFEconomicDataData>
{
  transformQuery(params: Partial<IMFEconomicDataQuery>): IMFEconomicDataQuery {
    return IMFEconomicDataQuerySchema.parse(params);
  }

  async extractData(
    query: IMFEconomicDataQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const baseUrl = 'https://www.imf.org/external/datamapper/api/v1';
    const url = `${baseUrl}/${query.indicator}/${query.country}`;

    const response = await makeRequest(url);

    if (!response.values) {
      throw new Error('No data returned from IMF API');
    }

    const countryData = response.values[query.indicator][query.country];
    if (!countryData) {
      throw new Error(`No data found for country ${query.country}`);
    }

    const results: any[] = [];
    for (const [year, value] of Object.entries(countryData)) {
      const yearNum = parseInt(year);
      if (query.start_year && yearNum < query.start_year) continue;
      if (query.end_year && yearNum > query.end_year) continue;

      results.push({
        date: year,
        value: value,
        country: query.country,
        indicator: query.indicator,
      });
    }

    return results;
  }

  transformData(_query: IMFEconomicDataQuery, data: any[]): IMFEconomicDataData[] {
    return data.map((item) => IMFEconomicDataDataSchema.parse(item));
  }
}
