/**
 * Alpha Vantage Equity Historical Price Model
 * Converted from Python OpenBB alpha_vantage models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';
import { addYears, today } from '../../../utils/dates';
import { INTERVALS_DICT, getInterval } from '../utils/helpers';

/**
 * Alpha Vantage Equity Historical Query Schema
 */
export const AVEquityHistoricalQuerySchema = z.object({
  symbol: z.string().describe('Stock ticker symbol(s), comma-separated for multiple'),
  start_date: z
    .string()
    .or(z.date())
    .optional()
    .describe('Start date for historical data'),
  end_date: z.string().or(z.date()).optional().describe('End date for historical data'),
  interval: z
    .enum(['1m', '5m', '15m', '30m', '60m', '1d', '1W', '1M'])
    .default('1d')
    .describe('Data interval'),
  adjustment: z
    .enum(['splits_only', 'splits_and_dividends', 'unadjusted'])
    .default('splits_only')
    .describe('Adjustment factor to apply'),
  extended_hours: z.boolean().default(false).describe('Include pre and post market data'),
});

export type AVEquityHistoricalQuery = z.infer<typeof AVEquityHistoricalQuerySchema>;

/**
 * Alpha Vantage Equity Historical Data Schema
 */
export const AVEquityHistoricalDataSchema = z.object({
  date: z.string().describe('Date of the data point'),
  symbol: z.string().optional().describe('Stock ticker symbol'),
  open: z.number().describe('Opening price'),
  high: z.number().describe('High price'),
  low: z.number().describe('Low price'),
  close: z.number().describe('Closing price'),
  volume: z.number().describe('Trading volume'),
  adj_close: z.number().optional().describe('Adjusted closing price'),
  dividend: z.number().optional().describe('Dividend amount'),
  split_ratio: z.number().optional().describe('Split coefficient'),
});

export type AVEquityHistoricalData = z.infer<typeof AVEquityHistoricalDataSchema>;

/**
 * Alpha Vantage Equity Historical Fetcher
 */
export class AVEquityHistoricalFetcher
  implements Fetcher<AVEquityHistoricalQuery, AVEquityHistoricalData>
{
  /**
   * Transform query parameters
   */
  transformQuery(params: Partial<AVEquityHistoricalQuery>): AVEquityHistoricalQuery {
    const now = today();
    const transformedParams: any = { ...params };

    if (!params.start_date) {
      transformedParams.start_date = addYears(now, -1);
    }
    if (!params.end_date) {
      transformedParams.end_date = now;
    }

    return AVEquityHistoricalQuerySchema.parse(transformedParams);
  }

  /**
   * Extract data from Alpha Vantage API
   */
  async extractData(
    query: AVEquityHistoricalQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.alpha_vantage_api_key || '';
    if (!apiKey) {
      throw new Error('Alpha Vantage API key is required');
    }

    const symbols = query.symbol.split(',');
    const interval = getInterval(query.interval);
    const results: any[] = [];

    // Determine function type
    const lastChar = query.interval.slice(-1);
    let functionName = INTERVALS_DICT[lastChar];

    if (query.adjustment !== 'unadjusted') {
      functionName += '_ADJUSTED';
    }

    for (const symbol of symbols) {
      let url = `https://www.alphavantage.co/query?function=${functionName}&symbol=${symbol.trim()}&apikey=${apiKey}&outputsize=full&datatype=json`;

      if (functionName.includes('INTRADAY')) {
        url += `&interval=${interval}&extended_hours=${query.extended_hours}`;
      }

      try {
        const response = await makeRequest(url);

        if (response['Error Message']) {
          console.warn(`Error fetching data for ${symbol}: ${response['Error Message']}`);
          continue;
        }

        if (response.Note) {
          console.warn(`API limit reached: ${response.Note}`);
          break;
        }

        // Extract time series data
        const timeSeriesKey = Object.keys(response).find((key) => key.includes('Time Series'));
        if (!timeSeriesKey || !response[timeSeriesKey]) {
          console.warn(`No data found for ${symbol}`);
          continue;
        }

        const timeSeries = response[timeSeriesKey];

        for (const [date, values] of Object.entries(timeSeries)) {
          const dataPoint: any = {
            date: date.split(' ')[0],
            symbol: symbols.length > 1 ? symbol.trim() : undefined,
            open: parseFloat((values as any)['1. open']),
            high: parseFloat((values as any)['2. high']),
            low: parseFloat((values as any)['3. low']),
            close: parseFloat((values as any)['4. close']),
            volume: parseInt((values as any)['5. volume'] || '0'),
          };

          if ((values as any)['6. adjusted close']) {
            dataPoint.adj_close = parseFloat((values as any)['6. adjusted close']);
          }
          if ((values as any)['7. dividend amount']) {
            dataPoint.dividend = parseFloat((values as any)['7. dividend amount']);
          }
          if ((values as any)['8. split coefficient']) {
            dataPoint.split_ratio = parseFloat((values as any)['8. split coefficient']);
          }

          results.push(dataPoint);
        }
      } catch (error) {
        console.error(`Error fetching data for ${symbol}:`, error);
      }
    }

    if (results.length === 0) {
      throw new Error('No data returned from Alpha Vantage API');
    }

    return results;
  }

  /**
   * Transform and validate data
   */
  transformData(query: AVEquityHistoricalQuery, data: any[]): AVEquityHistoricalData[] {
    const startDate =
      typeof query.start_date === 'string' ? new Date(query.start_date) : query.start_date!;
    const endDate =
      typeof query.end_date === 'string' ? new Date(query.end_date) : query.end_date!;

    // Filter by date range
    const filtered = data.filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate >= startDate && itemDate <= endDate;
    });

    // Sort by date and symbol
    const sorted = filtered.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      if (a.symbol && b.symbol) return a.symbol.localeCompare(b.symbol);
      return 0;
    });

    return sorted.map((item) => AVEquityHistoricalDataSchema.parse(item));
  }
}
