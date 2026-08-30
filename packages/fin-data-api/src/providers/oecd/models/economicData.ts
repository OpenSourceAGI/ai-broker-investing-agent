/**
 * OECD Economic Data Model
 * Converted from Python OpenBB oecd models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const OECDEconomicDataQuerySchema = z.object({
  country: z.string().describe('Country code (ISO 3-letter)'),
  indicator: z.string().describe('Indicator code'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
  frequency: z.enum(['A', 'Q', 'M']).optional().describe('Data frequency'),
});

export type OECDEconomicDataQuery = z.infer<typeof OECDEconomicDataQuerySchema>;

export const OECDEconomicDataDataSchema = z.object({
  date: z.string().describe('Date'),
  value: z.number().nullable().describe('Indicator value'),
  country: z.string().describe('Country code'),
  indicator: z.string().describe('Indicator code'),
});

export type OECDEconomicDataData = z.infer<typeof OECDEconomicDataDataSchema>;

export class OECDEconomicDataFetcher
  implements Fetcher<OECDEconomicDataQuery, OECDEconomicDataData>
{
  transformQuery(params: Partial<OECDEconomicDataQuery>): OECDEconomicDataQuery {
    return OECDEconomicDataQuerySchema.parse(params);
  }

  async extractData(
    query: OECDEconomicDataQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const params: string[] = [];

    if (query.start_date) {
      const startPeriod =
        typeof query.start_date === 'string'
          ? query.start_date
          : query.start_date.toISOString().split('T')[0];
      params.push(`startTime=${startPeriod}`);
    }

    if (query.end_date) {
      const endPeriod =
        typeof query.end_date === 'string'
          ? query.end_date
          : query.end_date.toISOString().split('T')[0];
      params.push(`endTime=${endPeriod}`);
    }

    const queryString = params.length > 0 ? `?${params.join('&')}` : '';
    const url = `https://stats.oecd.org/sdmx-json/data/${query.indicator}/${query.country}${queryString}`;

    const response = await makeRequest(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.dataSets?.[0]?.series) {
      throw new Error('No data returned from OECD API');
    }

    const seriesData = Object.values(response.dataSets[0].series)[0] as any;
    const observations = seriesData.observations;
    const dates = response.structure.dimensions.observation[0].values;

    const results: any[] = [];
    for (const [index, value] of Object.entries(observations)) {
      const dateIndex = parseInt(index);
      results.push({
        date: dates[dateIndex].id,
        value: (value as any)[0],
        country: query.country,
        indicator: query.indicator,
      });
    }

    return results;
  }

  transformData(_query: OECDEconomicDataQuery, data: any[]): OECDEconomicDataData[] {
    return data.map((item) => OECDEconomicDataDataSchema.parse(item));
  }
}
