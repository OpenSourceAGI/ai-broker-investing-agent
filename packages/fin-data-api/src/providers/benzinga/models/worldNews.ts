/**
 * Benzinga World News Model
 * Converted from Python OpenBB benzinga models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

/**
 * Benzinga World News Query Schema
 */
export const BenzingaWorldNewsQuerySchema = z.object({
  symbols: z.string().optional().describe('Symbols to filter news by'),
  start_date: z.string().or(z.date()).optional().describe('Start date for news'),
  end_date: z.string().or(z.date()).optional().describe('End date for news'),
  date: z.string().or(z.date()).optional().describe('Specific date for news'),
  display: z
    .enum(['headline', 'abstract', 'full'])
    .default('full')
    .describe('Display format for news'),
  updated_since: z.number().optional().describe('Seconds since news was updated'),
  published_since: z.number().optional().describe('Seconds since news was published'),
  sort: z
    .enum(['id', 'created', 'updated'])
    .default('created')
    .describe('Sort key for news'),
  order: z.enum(['asc', 'desc']).default('desc').describe('Sort order'),
  limit: z.number().default(100).describe('Number of results to return'),
  isin: z.string().optional().describe('ISIN to filter by'),
  cusip: z.string().optional().describe('CUSIP to filter by'),
  channels: z.string().optional().describe('Channels to filter by'),
  topics: z.string().optional().describe('Topics to filter by'),
  authors: z.string().optional().describe('Authors to filter by'),
  content_types: z.string().optional().describe('Content types to filter by'),
});

export type BenzingaWorldNewsQuery = z.infer<typeof BenzingaWorldNewsQuerySchema>;

/**
 * Benzinga World News Data Schema
 */
export const BenzingaWorldNewsDataSchema = z.object({
  date: z.string().describe('Publication date'),
  title: z.string().describe('News headline'),
  text: z.string().optional().describe('Full news text'),
  excerpt: z.string().optional().describe('News teaser/excerpt'),
  url: z.string().describe('URL to the news article'),
  id: z.string().describe('Article ID'),
  author: z.string().optional().describe('Article author'),
  channels: z.string().optional().describe('Associated channels'),
  stocks: z.string().optional().describe('Associated stocks'),
  tags: z.string().optional().describe('Associated tags'),
  updated: z.string().optional().describe('Last updated date'),
  images: z.array(z.string()).optional().describe('Associated images'),
});

export type BenzingaWorldNewsData = z.infer<typeof BenzingaWorldNewsDataSchema>;

/**
 * Benzinga World News Fetcher
 */
export class BenzingaWorldNewsFetcher
  implements Fetcher<BenzingaWorldNewsQuery, BenzingaWorldNewsData>
{
  transformQuery(params: Partial<BenzingaWorldNewsQuery>): BenzingaWorldNewsQuery {
    return BenzingaWorldNewsQuerySchema.parse(params);
  }

  async extractData(
    query: BenzingaWorldNewsQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const apiKey = credentials?.benzinga_api_key;
    if (!apiKey) {
      throw new Error('Benzinga API key is required');
    }

    const params: Record<string, string> = {
      token: apiKey,
      displayOutput: query.display,
      pageSize: query.limit.toString(),
      sortBy: query.sort + ':' + query.order,
    };

    if (query.start_date) {
      params.dateFrom =
        typeof query.start_date === 'string' ? query.start_date : query.start_date.toISOString();
    }
    if (query.end_date) {
      params.dateTo =
        typeof query.end_date === 'string' ? query.end_date : query.end_date.toISOString();
    }
    if (query.symbols) params.tickers = query.symbols;
    if (query.channels) params.channels = query.channels;
    if (query.topics) params.topics = query.topics;
    if (query.authors) params.author = query.authors;

    const queryString = new URLSearchParams(params).toString();
    const url = `https://api.benzinga.com/api/v2/news?${queryString}`;

    const response = await makeRequest(url);

    if (!response || !Array.isArray(response)) {
      throw new Error('Invalid response from Benzinga API');
    }

    return response;
  }

  transformData(_query: BenzingaWorldNewsQuery, data: any[]): BenzingaWorldNewsData[] {
    return data.map((item) => {
      const transformed: any = {
        date: item.created || item.date,
        title: item.title,
        text: item.body,
        excerpt: item.teaser,
        url: item.url,
        id: item.id,
        author: item.author,
        channels: Array.isArray(item.channels) ? item.channels.join(',') : item.channels,
        stocks: Array.isArray(item.stocks) ? item.stocks.join(',') : item.stocks,
        tags: Array.isArray(item.tags) ? item.tags.join(',') : item.tags,
        updated: item.updated,
        images: item.images || (item.image ? [item.image] : undefined),
      };

      return BenzingaWorldNewsDataSchema.parse(transformed);
    });
  }
}
