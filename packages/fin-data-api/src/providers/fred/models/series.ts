/**
 * FRED Series Data Model
 * Converted from Python OpenBB fred models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const FREDSeriesQuerySchema = z.object({
  series_id: z.string().describe('FRED series ID'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
  frequency: z
    .enum(['d', 'w', 'bw', 'm', 'q', 'sa', 'a'])
    .optional()
    .describe('Frequency aggregation'),
  aggregation_method: z
    .enum(['avg', 'sum', 'eop'])
    .default('avg')
    .describe('Aggregation method'),
  transform: z
    .enum(['chg', 'ch1', 'pch', 'pc1', 'pca', 'cch', 'cca', 'log'])
    .optional()
    .describe('Data transformation'),
});

export type FREDSeriesQuery = z.infer<typeof FREDSeriesQuerySchema>;

export const FREDSeriesDataSchema = z.object({
  date: z.string().describe('Observation date'),
  value: z.number().nullable().describe('Series value'),
});

export type FREDSeriesData = z.infer<typeof FREDSeriesDataSchema>;

export class FREDSeriesFetcher implements Fetcher<FREDSeriesQuery, FREDSeriesData> {
  transformQuery(params: Partial<FREDSeriesQuery>): FREDSeriesQuery {
    return FREDSeriesQuerySchema.parse(params);
  }

  async extractData(
    query: FREDSeriesQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.fred_api_key;
    if (!apiKey) {
      throw new Error('FRED API key is required');
    }

    const params: Record<string, string> = {
      series_id: query.series_id,
      api_key: apiKey,
      file_type: 'json',
    };

    if (query.start_date) {
      params.observation_start =
        typeof query.start_date === 'string' ? query.start_date : query.start_date.toISOString().split('T')[0];
    }
    if (query.end_date) {
      params.observation_end =
        typeof query.end_date === 'string' ? query.end_date : query.end_date.toISOString().split('T')[0];
    }
    if (query.frequency) {
      params.frequency = query.frequency;
    }
    if (query.aggregation_method) {
      params.aggregation_method = query.aggregation_method;
    }
    if (query.transform) {
      params.units = query.transform;
    }

    const url =
      `https://api.stlouisfed.org/fred/series/observations?` +
      new URLSearchParams(params).toString();

    const response = await makeRequest(url);

    if (!response.observations) {
      throw new Error('No data returned from FRED API');
    }

    return response.observations;
  }

  transformData(_query: FREDSeriesQuery, data: any[]): FREDSeriesData[] {
    return data
      .map((item) => ({
        date: item.date,
        value: item.value === '.' ? null : parseFloat(item.value),
      }))
      .map((item) => FREDSeriesDataSchema.parse(item));
  }
}
