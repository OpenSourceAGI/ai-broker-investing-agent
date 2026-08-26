/**
 * Seeking Alpha Calendar Earnings Model
 * Converted from Python OpenBB seeking_alpha models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { HEADERS } from '../utils/helpers';
import { makeRequest } from '../../../utils/http';
import { getDateArray, formatDate, addDays, today } from '../../../utils/dates';

/**
 * Seeking Alpha Calendar Earnings Query Schema
 */
export const SACalendarEarningsQuerySchema = z.object({
  start_date: z
    .string()
    .or(z.date())
    .optional()
    .describe('Start date for calendar earnings data'),
  end_date: z
    .string()
    .or(z.date())
    .optional()
    .describe('End date for calendar earnings data'),
  country: z
    .enum(['us', 'ca'])
    .default('us')
    .describe('The country to get calendar data for.'),
});

export type SACalendarEarningsQuery = z.infer<typeof SACalendarEarningsQuerySchema>;

/**
 * Seeking Alpha Calendar Earnings Data Schema
 */
export const SACalendarEarningsDataSchema = z.object({
  report_date: z.string().describe('The earnings report date'),
  symbol: z.string().describe('Stock ticker symbol'),
  name: z.string().optional().describe('Company name'),
  market_cap: z.number().optional().describe('Market cap of the entity'),
  reporting_time: z.string().optional().describe('The reporting time - e.g. after market close'),
  exchange: z.string().optional().describe('The primary trading exchange'),
  sector_id: z.number().optional().describe('The Seeking Alpha Sector ID'),
});

export type SACalendarEarningsData = z.infer<typeof SACalendarEarningsDataSchema>;

/**
 * Seeking Alpha Calendar Earnings Fetcher
 */
export class SACalendarEarningsFetcher
  implements Fetcher<SACalendarEarningsQuery, SACalendarEarningsData>
{
  /**
   * Transform query parameters
   */
  transformQuery(params: Partial<SACalendarEarningsQuery>): SACalendarEarningsQuery {
    const now = today();
    const transformedParams: any = { ...params };

    if (!params.start_date) {
      transformedParams.start_date = now;
    }
    if (!params.end_date) {
      transformedParams.end_date = addDays(now, 3);
    }

    return SACalendarEarningsQuerySchema.parse(transformedParams);
  }

  /**
   * Extract data from Seeking Alpha API
   */
  async extractData(
    query: SACalendarEarningsQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const results: any[] = [];

    // Convert dates to Date objects
    const startDate =
      typeof query.start_date === 'string' ? new Date(query.start_date) : query.start_date!;
    const endDate =
      typeof query.end_date === 'string' ? new Date(query.end_date) : query.end_date!;

    const dates = getDateArray(startDate, endDate).map((date) => formatDate(date));
    const currency = query.country === 'us' ? 'USD' : 'CAD';
    const messages: string[] = [];

    // Fetch data for each date in parallel
    const fetchPromises = dates.map(async (date) => {
      const url =
        `https://seekingalpha.com/api/v3/earnings_calendar/tickers?` +
        `filter%5Bselected_date%5D=${date}` +
        `&filter%5Bwith_rating%5D=false&filter%5Bcurrency%5D=${currency}`;

      try {
        const response = await makeRequest(url, { headers: HEADERS });

        // Try again if the response is blocked
        if (typeof response === 'string' && response.includes('blockScript')) {
          const retryResponse = await makeRequest(url, { headers: HEADERS });

          if (typeof retryResponse === 'string' && retryResponse.includes('blockScript')) {
            const message = JSON.stringify(retryResponse);
            messages.push(message);
            console.warn(message);
            return;
          }

          if (retryResponse.data) {
            return retryResponse.data;
          }
        }

        if (response.data) {
          return response.data;
        }
      } catch (error) {
        console.error(`Error fetching data for ${date}:`, error);
        messages.push(`Error fetching data for ${date}: ${error}`);
      }
    });

    const responses = await Promise.all(fetchPromises);

    // Flatten results
    responses.forEach((data) => {
      if (data && Array.isArray(data)) {
        results.push(...data);
      }
    });

    if (results.length === 0) {
      throw new Error(`Error with the Seeking Alpha request -> ${messages.join(', ')}`);
    }

    return results;
  }

  /**
   * Transform raw data to structured format
   */
  transformData(_query: SACalendarEarningsQuery, data: any[]): SACalendarEarningsData[] {
    const transformedData: SACalendarEarningsData[] = [];

    // Sort by release date
    const sortedData = [...data].sort((a, b) => {
      const dateA = a.attributes?.release_date || '';
      const dateB = b.attributes?.release_date || '';
      return dateA.localeCompare(dateB);
    });

    for (const row of sortedData) {
      const attributes = row.attributes || {};

      // Parse and format release date
      let releaseDate = attributes.release_date || '';
      if (releaseDate && releaseDate.includes('T')) {
        releaseDate = releaseDate.split('T')[0];
      }

      const transformed: any = {
        report_date: releaseDate,
        reporting_time: attributes.release_time,
        symbol: attributes.slug,
        name: attributes.name,
        market_cap: attributes.marketcap,
        exchange: attributes.exchange,
        sector_id: attributes.sector_id,
      };

      try {
        transformedData.push(SACalendarEarningsDataSchema.parse(transformed));
      } catch (error) {
        console.error('Error parsing data:', error, transformed);
      }
    }

    return transformedData;
  }
}
