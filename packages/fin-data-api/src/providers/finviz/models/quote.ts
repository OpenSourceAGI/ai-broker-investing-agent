/**
 * FinViz Quote Model
 * Converted from Python OpenBB finviz models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const FinVizQuoteQuerySchema = z.object({
  symbol: z.string().describe('Stock symbol'),
});

export type FinVizQuoteQuery = z.infer<typeof FinVizQuoteQuerySchema>;

export const FinVizQuoteDataSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  company: z.string().optional().describe('Company name'),
  sector: z.string().optional().describe('Sector'),
  industry: z.string().optional().describe('Industry'),
  country: z.string().optional().describe('Country'),
  market_cap: z.string().optional().describe('Market cap'),
  pe_ratio: z.string().optional().describe('P/E ratio'),
  price: z.string().optional().describe('Current price'),
  change: z.string().optional().describe('Price change'),
  volume: z.string().optional().describe('Volume'),
  avg_volume: z.string().optional().describe('Average volume'),
});

export type FinVizQuoteData = z.infer<typeof FinVizQuoteDataSchema>;

export class FinVizQuoteFetcher implements Fetcher<FinVizQuoteQuery, FinVizQuoteData> {
  transformQuery(params: Partial<FinVizQuoteQuery>): FinVizQuoteQuery {
    return FinVizQuoteQuerySchema.parse(params);
  }

  async extractData(
    query: FinVizQuoteQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const url = `https://finviz.com/quote.ashx?t=${query.symbol}`;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    };

    await makeRequest(url, { headers });

    // Note: This would require HTML parsing in a real implementation
    // For now, we'll return a placeholder indicating scraping is needed
    return [
      {
        symbol: query.symbol,
        company: 'Company Name',
        note: 'HTML scraping required - implement with cheerio or similar library',
      },
    ];
  }

  transformData(query: FinVizQuoteQuery, data: any[]): FinVizQuoteData[] {
    return data.map((item) =>
      FinVizQuoteDataSchema.parse({
        symbol: query.symbol,
        company: item.company,
        sector: item.sector,
        industry: item.industry,
        country: item.country,
        market_cap: item.market_cap,
        pe_ratio: item.pe_ratio,
        price: item.price,
        change: item.change,
        volume: item.volume,
        avg_volume: item.avg_volume,
      })
    );
  }
}
