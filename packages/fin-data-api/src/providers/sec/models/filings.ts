/**
 * SEC Filings Model
 * Converted from Python OpenBB sec models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const SECFilingsQuerySchema = z.object({
  symbol: z.string().optional().describe('Stock symbol'),
  cik: z.string().optional().describe('CIK number'),
  form_type: z.string().optional().describe('Form type (e.g., 10-K, 10-Q, 8-K)'),
  limit: z.number().default(100).describe('Number of results'),
  start_date: z.string().or(z.date()).optional().describe('Start date'),
  end_date: z.string().or(z.date()).optional().describe('End date'),
});

export type SECFilingsQuery = z.infer<typeof SECFilingsQuerySchema>;

export const SECFilingsDataSchema = z.object({
  filing_date: z.string().describe('Filing date'),
  accepted_date: z.string().optional().describe('Acceptance date'),
  symbol: z.string().optional().describe('Stock symbol'),
  cik: z.string().describe('CIK number'),
  form_type: z.string().describe('Form type'),
  description: z.string().optional().describe('Filing description'),
  filing_url: z.string().describe('URL to filing'),
  report_url: z.string().optional().describe('URL to report'),
});

export type SECFilingsData = z.infer<typeof SECFilingsDataSchema>;

export class SECFilingsFetcher implements Fetcher<SECFilingsQuery, SECFilingsData> {
  transformQuery(params: Partial<SECFilingsQuery>): SECFilingsQuery {
    if (!params.symbol && !params.cik) {
      throw new Error('Either symbol or CIK is required');
    }
    return SECFilingsQuerySchema.parse(params);
  }

  async extractData(
    query: SECFilingsQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    // First, get CIK from symbol if needed
    let cik = query.cik;

    if (!cik && query.symbol) {
      const tickerUrl = 'https://www.sec.gov/files/company_tickers.json';
      const headers = {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      };
      const tickerData = await makeRequest(tickerUrl, { headers });

      const entry = Object.values(tickerData).find(
        (item: any) => item.ticker.toLowerCase() === query.symbol?.toLowerCase()
      );

      if (!entry) {
        throw new Error(`CIK not found for symbol: ${query.symbol}`);
      }

      cik = (entry as any).cik_str.toString().padStart(10, '0');
    }

    // Fetch filings
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const headers = {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json',
    };

    const response = await makeRequest(url, { headers });

    if (!response.filings?.recent) {
      throw new Error('No filings found');
    }

    const recent = response.filings.recent;
    const filings: any[] = [];

    for (let i = 0; i < recent.filingDate.length; i++) {
      if (query.form_type && recent.form[i] !== query.form_type) {
        continue;
      }

      filings.push({
        filing_date: recent.filingDate[i],
        accepted_date: recent.acceptanceDateTime[i],
        symbol: query.symbol,
        cik: cik,
        form_type: recent.form[i],
        description: recent.primaryDocument[i],
        filing_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${recent.form[i]}&dateb=&owner=exclude&count=100`,
        report_url: recent.primaryDocDescription[i],
      });

      if (filings.length >= query.limit) break;
    }

    return filings;
  }

  transformData(_query: SECFilingsQuery, data: any[]): SECFilingsData[] {
    return data.map((item) => SECFilingsDataSchema.parse(item));
  }
}
