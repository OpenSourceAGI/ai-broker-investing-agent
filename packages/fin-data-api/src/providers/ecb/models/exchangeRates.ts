/**
 * ECB Exchange Rates Model
 * Converted from Python OpenBB ecb models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const ECBExchangeRatesQuerySchema = z.object({
  currency: z.string().default('USD').describe('Currency code (e.g., USD, GBP)'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
});

export type ECBExchangeRatesQuery = z.infer<typeof ECBExchangeRatesQuerySchema>;

export const ECBExchangeRatesDataSchema = z.object({
  date: z.string().describe('Date'),
  rate: z.number().describe('Exchange rate'),
  currency: z.string().describe('Currency code'),
});

export type ECBExchangeRatesData = z.infer<typeof ECBExchangeRatesDataSchema>;

export class ECBExchangeRatesFetcher
  implements Fetcher<ECBExchangeRatesQuery, ECBExchangeRatesData>
{
  transformQuery(params: Partial<ECBExchangeRatesQuery>): ECBExchangeRatesQuery {
    return ECBExchangeRatesQuerySchema.parse(params);
  }

  async extractData(
    query: ECBExchangeRatesQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    let url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${query.currency}.EUR.SP00.A`;

    const params: string[] = [];

    if (query.start_date) {
      const startPeriod =
        typeof query.start_date === 'string'
          ? query.start_date
          : query.start_date.toISOString().split('T')[0];
      params.push(`startPeriod=${startPeriod}`);
    }

    if (query.end_date) {
      const endPeriod =
        typeof query.end_date === 'string'
          ? query.end_date
          : query.end_date.toISOString().split('T')[0];
      params.push(`endPeriod=${endPeriod}`);
    }

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    const response = await makeRequest(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.dataSets?.[0]?.series) {
      throw new Error('No data returned from ECB API');
    }

    const seriesData = Object.values(response.dataSets[0].series)[0] as any;
    const observations = seriesData.observations;
    const dates = response.structure.dimensions.observation[0].values;

    const results: any[] = [];
    for (const [index, value] of Object.entries(observations)) {
      const dateIndex = parseInt(index);
      results.push({
        date: dates[dateIndex].id,
        rate: parseFloat((value as any)[0]),
        currency: query.currency,
      });
    }

    return results;
  }

  transformData(_query: ECBExchangeRatesQuery, data: any[]): ECBExchangeRatesData[] {
    return data.map((item) => ECBExchangeRatesDataSchema.parse(item));
  }
}
