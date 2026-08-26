/**
 * Deribit Options Model
 * Converted from Python OpenBB deribit models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const DeribitOptionsQuerySchema = z.object({
  currency: z.enum(['BTC', 'ETH']).default('BTC').describe('Cryptocurrency'),
  kind: z.enum(['option', 'future']).default('option').describe('Instrument kind'),
  expired: z.boolean().default(false).describe('Include expired instruments'),
});

export type DeribitOptionsQuery = z.infer<typeof DeribitOptionsQuerySchema>;

export const DeribitOptionsDataSchema = z.object({
  instrument_name: z.string().describe('Instrument name'),
  creation_timestamp: z.number().describe('Creation timestamp'),
  expiration_timestamp: z.number().describe('Expiration timestamp'),
  strike: z.number().optional().describe('Strike price'),
  option_type: z.string().optional().describe('Option type (call/put)'),
  settlement_period: z.string().describe('Settlement period'),
  is_active: z.boolean().describe('Is active'),
  tick_size: z.number().describe('Tick size'),
  min_trade_amount: z.number().describe('Minimum trade amount'),
});

export type DeribitOptionsData = z.infer<typeof DeribitOptionsDataSchema>;

export class DeribitOptionsFetcher implements Fetcher<DeribitOptionsQuery, DeribitOptionsData> {
  transformQuery(params: Partial<DeribitOptionsQuery>): DeribitOptionsQuery {
    return DeribitOptionsQuerySchema.parse(params);
  }

  async extractData(
    query: DeribitOptionsQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const url =
      `https://www.deribit.com/api/v2/public/get_instruments?` +
      `currency=${query.currency}&kind=${query.kind}&expired=${query.expired}`;

    const response = await makeRequest(url);

    if (!response.result) {
      throw new Error('No data returned from Deribit API');
    }

    return response.result;
  }

  transformData(_query: DeribitOptionsQuery, data: any[]): DeribitOptionsData[] {
    return data.map((item) =>
      DeribitOptionsDataSchema.parse({
        instrument_name: item.instrument_name,
        creation_timestamp: item.creation_timestamp,
        expiration_timestamp: item.expiration_timestamp,
        strike: item.strike,
        option_type: item.option_type,
        settlement_period: item.settlement_period,
        is_active: item.is_active,
        tick_size: item.tick_size,
        min_trade_amount: item.min_trade_amount,
      })
    );
  }
}
