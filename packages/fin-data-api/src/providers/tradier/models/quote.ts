/**
 * Tradier Quote Model
 * Converted from Python OpenBB tradier models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const TradierQuoteQuerySchema = z.object({
  symbol: z.string().describe('Stock symbol(s), comma-separated'),
});

export type TradierQuoteQuery = z.infer<typeof TradierQuoteQuerySchema>;

export const TradierQuoteDataSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  description: z.string().optional().describe('Description'),
  last: z.number().describe('Last price'),
  change: z.number().optional().describe('Price change'),
  change_percentage: z.number().optional().describe('Percent change'),
  volume: z.number().optional().describe('Volume'),
  open: z.number().optional().describe('Open price'),
  high: z.number().optional().describe('High price'),
  low: z.number().optional().describe('Low price'),
  close: z.number().optional().describe('Close price'),
  bid: z.number().optional().describe('Bid price'),
  ask: z.number().optional().describe('Ask price'),
  bid_size: z.number().optional().describe('Bid size'),
  ask_size: z.number().optional().describe('Ask size'),
});

export type TradierQuoteData = z.infer<typeof TradierQuoteDataSchema>;

export class TradierQuoteFetcher implements Fetcher<TradierQuoteQuery, TradierQuoteData> {
  transformQuery(params: Partial<TradierQuoteQuery>): TradierQuoteQuery {
    return TradierQuoteQuerySchema.parse(params);
  }

  async extractData(
    query: TradierQuoteQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.tradier_api_key;
    if (!apiKey) {
      throw new Error('Tradier API key is required');
    }

    const url = `https://api.tradier.com/v1/markets/quotes?symbols=${query.symbol}`;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    };

    const response = await makeRequest(url, { headers });

    if (!response.quotes?.quote) {
      throw new Error('No data returned from Tradier API');
    }

    const quotes = Array.isArray(response.quotes.quote)
      ? response.quotes.quote
      : [response.quotes.quote];

    return quotes;
  }

  transformData(_query: TradierQuoteQuery, data: any[]): TradierQuoteData[] {
    return data.map((item) =>
      TradierQuoteDataSchema.parse({
        symbol: item.symbol,
        description: item.description,
        last: item.last,
        change: item.change,
        change_percentage: item.change_percentage,
        volume: item.volume,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        bid: item.bid,
        ask: item.ask,
        bid_size: item.bidsize,
        ask_size: item.asksize,
      })
    );
  }
}
