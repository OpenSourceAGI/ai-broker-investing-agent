/**
 * CFTC Commitment of Traders Reports Model
 * Converted from Python OpenBB CFTC models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';
import { formatDate } from '../../../utils/dates';

const reportsDict: Record<string, string> = {
  legacy_futures_only: '6dca-aqww',
  legacy_combined: 'jun7-fc8e',
  disaggregated_futures_only: '72hh-3qpy',
  disaggregated_combined: 'kh3c-gbw2',
  tff_futures_only: 'gpe5-46if',
  tff_combined: 'yw9f-hn96',
  supplemental: '4zgm-a668',
};

/**
 * CFTC COT Query Schema
 */
export const CftcCotQuerySchema = z.object({
  id: z
    .string()
    .default('all')
    .describe(
      'The CFTC commodity code, commodity name, or contract market name. Set to "all" to return all items in the report type.'
    ),
  start_date: z.string().or(z.date()).optional().describe('Start date for the data query'),
  end_date: z.string().or(z.date()).optional().describe('End date for the data query'),
  report_type: z
    .enum(['legacy', 'disaggregated', 'financial', 'supplemental'])
    .default('legacy')
    .describe(
      'The type of report to retrieve. Legacy: broken down by exchange. ' +
        'Disaggregated: broken down by Agriculture and Natural Resource contracts. ' +
        'Financial (TFF): includes financial contracts. ' +
        'Supplemental: supplemental report.'
    ),
  futures_only: z
    .boolean()
    .default(false)
    .describe('Returns the futures-only report. Default is False, for the combined report.'),
});

export type CftcCotQuery = z.infer<typeof CftcCotQuerySchema>;

/**
 * CFTC COT Data Schema
 */
export const CftcCotDataSchema = z.object({
  date: z.string().describe('The report date'),
  report_week: z.string().optional().describe('The report week in YYYY-WW format'),
  commodity_group: z.string().optional().describe('The commodity group name'),
  commodity: z.string().optional().describe('The commodity name'),
  commodity_subgroup: z.string().optional().describe('The commodity subgroup name'),
  market_and_exchange_names: z.string().optional().describe('Market and exchange names'),
  cftc_contract_market_code: z.string().optional().describe('CFTC contract market code'),
  cftc_market_code: z.string().optional().describe('CFTC market code'),
  cftc_region_code: z.string().optional().describe('CFTC region code'),
  cftc_commodity_code: z.string().optional().describe('CFTC commodity code'),
  open_interest_all: z.number().optional().describe('Open interest for all positions'),
  // Additional fields would be added based on report type
});

export type CftcCotData = z.infer<typeof CftcCotDataSchema>;

/**
 * CFTC COT Fetcher
 */
export class CftcCotFetcher implements Fetcher<CftcCotQuery, CftcCotData> {
  /**
   * Transform query parameters
   */
  transformQuery(params: Partial<CftcCotQuery>): CftcCotQuery {
    return CftcCotQuerySchema.parse(params);
  }

  /**
   * Extract data from CFTC API
   */
  async extractData(
    query: CftcCotQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const appToken = credentials?.cftc_app_token || '';

    const today = new Date();

    // Determine start date
    let startDate: string;
    if (query.id === '500' || !query.id.substring(0, 3).match(/^\d/)) {
      // Get most recent Tuesday
      const dayOfWeek = today.getDay();
      const daysToSubtract = dayOfWeek === 0 ? 5 : dayOfWeek === 1 ? 6 : dayOfWeek - 2;
      const recentTuesday = new Date(today);
      recentTuesday.setDate(today.getDate() - daysToSubtract);
      startDate = formatDate(recentTuesday);
    } else {
      startDate = '1995-01-01';
    }

    startDate = query.start_date
      ? typeof query.start_date === 'string'
        ? query.start_date
        : formatDate(query.start_date)
      : startDate;

    const endDate = query.end_date
      ? typeof query.end_date === 'string'
        ? query.end_date
        : formatDate(query.end_date)
      : `${today.getFullYear()}-12-31`;

    const dateRange = `$where=Report_Date_as_YYYY_MM_DD between '${startDate}' AND '${endDate}'`;

    // Determine report type
    let reportType = query.report_type.replace('financial', 'tff');
    if (query.futures_only && reportType !== 'supplemental') {
      reportType += '_futures_only';
    } else if (!query.futures_only && reportType !== 'supplemental') {
      reportType += '_combined';
    }

    // Handle ID parameter
    let id = query.id === 'all' ? '' : query.id;
    if (id && !id.substring(0, 3).match(/^\d/)) {
      id = `%${id}%`;
    }
    id = id.replace('+', '%2B').replace('&', '%26');

    // Build URL
    const baseUrl = `https://publicreporting.cftc.gov/resource/${reportsDict[reportType]}.json?$limit=1000000&${dateRange}`;
    const order = '&$order=Report_Date_as_YYYY_MM_DD ASC';

    let url: string;
    if (id) {
      url =
        `${baseUrl}` +
        ` AND (UPPER(contract_market_name) like UPPER('${id}') ` +
        `OR UPPER(commodity) like UPPER('${id}') ` +
        `OR UPPER(cftc_contract_market_code) like UPPER('${id}') ` +
        `OR UPPER(commodity_group_name) like UPPER('${id}') ` +
        `OR UPPER(commodity_subgroup_name) like UPPER('${id}'))`;
    } else {
      url = baseUrl;
    }

    url = `${url}${order}`;

    if (appToken) {
      url += `&$$app_token=${appToken}`;
    }

    try {
      const response = await makeRequest(url);

      if (!response || (Array.isArray(response) && response.length === 0)) {
        throw new Error(`No data found for ${query.id.replace(/%/g, '')}.`);
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch CFTC data: ${error}`);
    }
  }

  /**
   * Transform and validate the data
   */
  transformData(_query: CftcCotQuery, data: any[]): CftcCotData[] {
    const stringCols = [
      'market_and_exchange_names',
      'cftc_contract_market_code',
      'cftc_market_code',
      'cftc_region_code',
      'cftc_commodity_code',
      'cftc_contract_market_code_quotes',
      'cftc_market_code_quotes',
      'cftc_commodity_code_quotes',
      'cftc_subgroup_code',
      'commodity_group_name',
      'commodity',
      'commodity_name',
      'commodity_subgroup_name',
      'contract_units',
      'report_date_as_yyyy_mm_dd',
      'yyyy_report_week_ww',
      'id',
      'futonly_or_combined',
    ];

    const results: CftcCotData[] = [];

    for (const values of data) {
      const newValues: any = {};

      for (const [key, value] of Object.entries(values)) {
        const lowerKey = key.toLowerCase();

        if (stringCols.includes(lowerKey) && value) {
          newValues[lowerKey] = String(value);
        } else if (key === 'report_date_as_yyyy_mm_dd') {
          newValues['date'] = String(value).split('T')[0];
        } else if (key === 'yyyy_report_week_ww') {
          newValues['report_week'] = String(value);
        } else if (key === 'commodity_group_name') {
          newValues['commodity_group'] = String(value);
        } else if (key === 'commodity_name') {
          newValues['commodity'] = String(value);
        } else if (key === 'commodity_subgroup_name') {
          newValues['commodity_subgroup'] = String(value);
        } else if (lowerKey.startsWith('pct_') && value) {
          newValues[lowerKey.replace(/__/g, '_')] = Number(value) / 100;
        } else if (lowerKey.startsWith('conc_') && value) {
          newValues[lowerKey.replace(/__/g, '_')] = Number(value);
        } else if (value) {
          try {
            newValues[lowerKey.replace(/__/g, '_')] = Number.isInteger(Number(value))
              ? parseInt(String(value))
              : value;
          } catch {
            newValues[lowerKey.replace(/__/g, '_')] = value;
          }
        }
      }

      if (Object.keys(newValues).length > 0) {
        try {
          results.push(CftcCotDataSchema.parse(newValues));
        } catch (error) {
          console.error('Error parsing CFTC data:', error, newValues);
        }
      }
    }

    return results;
  }
}
