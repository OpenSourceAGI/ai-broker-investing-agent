/**
 * FMP Quote Model
 * Converted from Python OpenBB fmp models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const FMPQuoteQuerySchema = z.object({
  symbol: z.string().describe('Stock symbol(s), comma-separated'),
});

export type FMPQuoteQuery = z.infer<typeof FMPQuoteQuerySchema>;

export const FMPQuoteDataSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  name: z.string().optional().describe('Company name'),
  price: z.number().describe('Current price'),
  change: z.number().optional().describe('Price change'),
  percent_change: z.number().optional().describe('Percent change'),
  volume: z.number().optional().describe('Trading volume'),
  avg_volume: z.number().optional().describe('Average volume'),
  market_cap: z.number().optional().describe('Market capitalization'),
  pe_ratio: z.number().optional().describe('P/E ratio'),
  eps: z.number().optional().describe('Earnings per share'),
  earnings_announcement: z.string().optional().describe('Next earnings date'),
  shares_outstanding: z.number().optional().describe('Shares outstanding'),
  timestamp: z.number().optional().describe('Quote timestamp'),
});

export type FMPQuoteData = z.infer<typeof FMPQuoteDataSchema>;

export class FMPQuoteFetcher implements Fetcher<FMPQuoteQuery, FMPQuoteData> {
  transformQuery(params: Partial<FMPQuoteQuery>): FMPQuoteQuery {
    return FMPQuoteQuerySchema.parse(params);
  }

  async extractData(
    query: FMPQuoteQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.fmp_api_key;
    if (!apiKey) {
      throw new Error('FMP API key is required');
    }

    const url = `https://financialmodelingprep.com/api/v3/quote/${query.symbol}?apikey=${apiKey}`;
    const response = await makeRequest(url);

    if (!Array.isArray(response) || response.length === 0) {
      throw new Error('No data returned from FMP API');
    }

    return response;
  }

  transformData(_query: FMPQuoteQuery, data: any[]): FMPQuoteData[] {
    return data.map((item) =>
      FMPQuoteDataSchema.parse({
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        change: item.change,
        percent_change: item.changesPercentage,
        volume: item.volume,
        avg_volume: item.avgVolume,
        market_cap: item.marketCap,
        pe_ratio: item.pe,
        eps: item.eps,
        earnings_announcement: item.earningsAnnouncement,
        shares_outstanding: item.sharesOutstanding,
        timestamp: item.timestamp,
      })
    );
  }
}
