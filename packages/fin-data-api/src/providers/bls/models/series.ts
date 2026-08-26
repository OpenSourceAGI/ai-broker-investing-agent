/**
 * BLS Series Data Model
 * Converted from Python OpenBB bls models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const BLSSeriesQuerySchema = z.object({
  series_id: z.string().describe('BLS series ID (e.g., CUUR0000SA0)'),
  start_date: z.string().optional().describe('Start date (YYYY or YYYY-MM format)'),
  end_date: z.string().optional().describe('End date (YYYY or YYYY-MM format)'),
  calculations: z.boolean().default(false).describe('Include period calculations'),
  annual_average: z.boolean().default(false).describe('Include annual average'),
  aspects: z.boolean().default(false).describe('Include aspects'),
});

export type BLSSeriesQuery = z.infer<typeof BLSSeriesQuerySchema>;

export const BLSSeriesDataSchema = z.object({
  date: z.string().describe('Date of observation'),
  value: z.number().describe('Series value'),
  series_id: z.string().describe('Series ID'),
  year: z.string().describe('Year'),
  period: z.string().describe('Period (e.g., M01 for January)'),
  period_name: z.string().optional().describe('Period name'),
  latest: z.boolean().optional().describe('Latest data point indicator'),
  calculations: z.record(z.any()).optional().describe('Calculations if requested'),
});

export type BLSSeriesData = z.infer<typeof BLSSeriesDataSchema>;

export class BLSSeriesFetcher implements Fetcher<BLSSeriesQuery, BLSSeriesData> {
  transformQuery(params: Partial<BLSSeriesQuery>): BLSSeriesQuery {
    return BLSSeriesQuerySchema.parse(params);
  }

  async extractData(
    query: BLSSeriesQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.bls_api_key;
    const baseUrl = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

    const requestBody: any = {
      seriesid: [query.series_id],
      calculations: query.calculations,
      annualaverage: query.annual_average,
      aspects: query.aspects,
    };

    if (query.start_date) {
      const startYear = query.start_date.substring(0, 4);
      requestBody.startyear = startYear;
    }

    if (query.end_date) {
      const endYear = query.end_date.substring(0, 4);
      requestBody.endyear = endYear;
    }

    if (apiKey) {
      requestBody.registrationkey = apiKey;
    }

    const response = await makeRequest(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      data: requestBody,
    });

    if (response.status !== 'REQUEST_SUCCEEDED') {
      throw new Error(`BLS API error: ${response.message || 'Unknown error'}`);
    }

    if (!response.Results?.series?.[0]?.data) {
      throw new Error('No data returned from BLS API');
    }

    return response.Results.series[0].data;
  }

  transformData(query: BLSSeriesQuery, data: any[]): BLSSeriesData[] {
    return data.map((item) => {
      const year = item.year;
      const period = item.period;
      let date = year;

      // Convert period to month
      if (period.startsWith('M')) {
        const month = period.substring(1);
        date = `${year}-${month.padStart(2, '0')}`;
      } else if (period.startsWith('Q')) {
        const quarter = parseInt(period.substring(1));
        const month = (quarter - 1) * 3 + 1;
        date = `${year}-${month.toString().padStart(2, '0')}`;
      }

      return BLSSeriesDataSchema.parse({
        date,
        value: parseFloat(item.value),
        series_id: query.series_id,
        year: item.year,
        period: item.period,
        period_name: item.periodName,
        latest: item.latest === 'true',
        calculations: item.calculations,
      });
    });
  }
}
