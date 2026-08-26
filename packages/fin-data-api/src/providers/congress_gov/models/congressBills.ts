/**
 * Congress Bills Model
 * Converted from Python OpenBB congress_gov models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { BillType, BillTypes, billTypeDocstring } from '../utils/constants';
import { yearToCongress, getAllBillsByType, getBillsByType } from '../utils/helpers';

/**
 * Congress Bills Query Parameters Schema
 */
export const CongressBillsQuerySchema = z
  .object({
    congress: z
      .number()
      .int()
      .optional()
      .describe(
        'Congress number (e.g., 118 for the 118th Congress). ' +
          'The 103rd Congress started in 1993, which is the earliest date supporting full text versions. ' +
          'Each Congress spans two years, starting in odd-numbered years.'
      ),
    bill_type: z
      .enum(BillTypes)
      .optional()
      .describe(billTypeDocstring),
    start_date: z
      .string()
      .or(z.date())
      .optional()
      .describe('Start date for data query. Filters bills by the last updated date.'),
    end_date: z
      .string()
      .or(z.date())
      .optional()
      .describe('End date for data query. Filters bills by the last updated date.'),
    limit: z
      .number()
      .int()
      .optional()
      .describe(
        'Maximum number of results to return. When null, default sets to 100 (max 250). ' +
          "Set to 0 for no limit (must be used with 'bill_type' and 'congress'). " +
          'Setting to 0 will nullify the start_date, end_date, and offset parameters.'
      ),
    offset: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('The starting record returned. 0 is the first record.'),
    sort_by: z
      .enum(['asc', 'desc'])
      .default('desc')
      .describe('Sort by update date. Default is latest first.'),
  })
  .refine(
    (data) => {
      if (data.bill_type && !BillTypes.includes(data.bill_type as BillType)) {
        return false;
      }
      return true;
    },
    {
      message: `Invalid bill_type. Must be one of: ${BillTypes.join(', ')}.`,
    }
  )
  .refine(
    (data) => {
      if (data.limit === 0 && !data.bill_type) {
        return false;
      }
      return true;
    },
    {
      message: "'limit' cannot be set to 0 without 'bill_type' and 'congress'.",
    }
  );

export type CongressBillsQuery = z.infer<typeof CongressBillsQuerySchema>;

/**
 * Congress Bills Data Schema
 */
export const CongressBillsDataSchema = z.object({
  update_date: z.string().describe('The date the bill was last updated.'),
  latest_action_date: z.string().optional().describe('The date of the latest action on the bill.'),
  bill_url: z.string().describe('Base URL to the bill for the congress.gov API.'),
  congress: z.number().int().describe('The congress session number.'),
  bill_number: z.number().int().describe('The bill number.'),
  origin_chamber: z.string().describe('The chamber where the bill originated.'),
  origin_chamber_code: z.string().describe('The chamber code where the bill originated.'),
  bill_type: z.string().describe('The type of bill (e.g., HR, S).'),
  title: z.string().describe('The title of the bill.'),
  latest_action: z.string().optional().describe('Latest action information for the bill.'),
  update_date_including_text: z
    .string()
    .optional()
    .describe('The date and time the bill text was last updated.'),
});

export type CongressBillsData = z.infer<typeof CongressBillsDataSchema>;

/**
 * Congress Bills Fetcher
 * Implements the Fetcher interface for Congress Bills
 */
export class CongressBillsFetcher
  implements Fetcher<CongressBillsQuery, CongressBillsData>
{
  /**
   * Transform query parameters
   */
  transformQuery(params: Partial<CongressBillsQuery>): CongressBillsQuery {
    const validated = CongressBillsQuerySchema.parse(params);
    return validated;
  }

  /**
   * Extract data from Congress.gov API
   */
  async extractData(
    query: CongressBillsQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.congress_gov_api_key || '';

    if (!apiKey) {
      throw new Error('Missing credentials: congress_gov_api_key');
    }

    let congress = query.congress;

    // Determine congress number
    if (query.bill_type && !query.start_date && !query.end_date && !query.congress) {
      congress = yearToCongress(new Date().getFullYear());
    } else if (query.bill_type && !query.congress && query.start_date) {
      congress = yearToCongress(new Date(query.start_date).getFullYear());
    } else if (query.bill_type && !query.congress && query.end_date && !query.start_date) {
      congress = yearToCongress(new Date(query.end_date).getFullYear());
    } else if (query.bill_type && query.start_date && query.end_date && !query.congress) {
      const congressStart = yearToCongress(new Date(query.start_date).getFullYear());
      congress = congressStart;
    } else if (query.bill_type && !query.congress) {
      congress = yearToCongress(new Date().getFullYear());
    }

    // Fetch all bills if limit is 0
    if (query.limit === 0 && query.bill_type && congress) {
      return await getAllBillsByType(
        congress,
        query.bill_type as BillType,
        undefined,
        undefined,
        apiKey
      );
    }

    // Format dates for API
    const startDate = query.start_date
      ? typeof query.start_date === 'string'
        ? query.start_date
        : query.start_date.toISOString().split('T')[0]
      : undefined;

    const endDate = query.end_date
      ? typeof query.end_date === 'string'
        ? query.end_date
        : query.end_date.toISOString().split('T')[0]
      : undefined;

    // Fetch bills
    const response = await getBillsByType(
      {
        congress,
        billType: query.bill_type as BillType,
        startDate,
        endDate,
        limit: query.limit || 100,
        offset: query.offset || 0,
        sortBy: query.sort_by,
      },
      apiKey
    );

    if (response.error) {
      if (response.error.code?.includes('API_KEY')) {
        throw new Error(`Unauthorized: ${response.error.code} -> ${response.error.message}`);
      }
      throw new Error(`${response.error.code} -> ${response.error.message}`);
    }

    return response.bills || [];
  }

  /**
   * Transform raw data into CongressBillsData models
   */
  transformData(query: CongressBillsQuery, data: any[]): CongressBillsData[] {
    const transformedData: CongressBillsData[] = [];

    // Sort by latest action date
    const sortedData = [...data].sort((a, b) => {
      const dateA = a.latestAction?.actionDate || a.updateDate;
      const dateB = b.latestAction?.actionDate || b.updateDate;
      return query.sort_by === 'desc'
        ? dateB.localeCompare(dateA)
        : dateA.localeCompare(dateB);
    });

    for (const bill of sortedData) {
      const latestAction = bill.latestAction || {};

      const transformed: any = {
        update_date: bill.updateDate,
        latest_action_date: latestAction.actionDate,
        bill_url: bill.url,
        congress: bill.congress,
        bill_number: bill.number,
        origin_chamber: bill.originChamber,
        origin_chamber_code: bill.originChamberCode,
        bill_type: bill.type,
        title: bill.title,
        latest_action: latestAction.text,
        update_date_including_text: bill.updateDateIncludingText,
      };

      transformedData.push(CongressBillsDataSchema.parse(transformed));
    }

    return transformedData;
  }
}
