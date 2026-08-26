/**
 * BizToc News Model
 * Converted from Python OpenBB biztoc models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const BizTocNewsQuerySchema = z.object({
  term: z.string().optional().describe('Search term for news'),
  source: z.string().optional().describe('Source to filter news by'),
  tag: z.string().optional().describe('Tag to filter news by'),
  limit: z.number().default(20).describe('Number of results to return'),
});

export type BizTocNewsQuery = z.infer<typeof BizTocNewsQuerySchema>;

export const BizTocNewsDataSchema = z.object({
  id: z.string().describe('Article ID'),
  title: z.string().describe('Article title'),
  url: z.string().describe('Article URL'),
  created: z.string().describe('Creation date'),
  domain: z.string().optional().describe('Source domain'),
  tags: z.array(z.string()).optional().describe('Article tags'),
  img: z.string().optional().describe('Article image'),
  body_preview: z.string().optional().describe('Article preview text'),
});

export type BizTocNewsData = z.infer<typeof BizTocNewsDataSchema>;

export class BizTocNewsFetcher implements Fetcher<BizTocNewsQuery, BizTocNewsData> {
  transformQuery(params: Partial<BizTocNewsQuery>): BizTocNewsQuery {
    return BizTocNewsQuerySchema.parse(params);
  }

  async extractData(
    query: BizTocNewsQuery,
    credentials?: Record<string, string>
  ): Promise<any[]> {
    const rapidApiKey = credentials?.rapidapi_key;
    if (!rapidApiKey) {
      throw new Error('RapidAPI key is required for BizToc');
    }

    const baseUrl = 'https://biztoc.p.rapidapi.com';
    let endpoint = '/news/latest';

    if (query.term) {
      endpoint = `/search?q=${encodeURIComponent(query.term)}`;
    } else if (query.source) {
      endpoint = `/news/source/${query.source}`;
    } else if (query.tag) {
      endpoint = `/tag/${query.tag}`;
    }

    const url = `${baseUrl}${endpoint}`;
    const headers = {
      'X-RapidAPI-Key': rapidApiKey,
      'X-RapidAPI-Host': 'biztoc.p.rapidapi.com',
    };

    const response = await makeRequest(url, { headers });

    if (!response) {
      throw new Error('No data returned from BizToc API');
    }

    const articles = Array.isArray(response) ? response : response.stories || [];
    return articles.slice(0, query.limit);
  }

  transformData(_query: BizTocNewsQuery, data: any[]): BizTocNewsData[] {
    return data.map((item) => BizTocNewsDataSchema.parse(item));
  }
}
