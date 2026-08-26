/**
 * U.S. Government Data Model
 * Converted from Python OpenBB government_us models
 */

import { z } from 'zod';
import { Fetcher } from '../../../types/base';
import { makeRequest } from '../../../utils/http';

export const GovernmentUSDatasetQuerySchema = z.object({
  dataset_id: z.string().describe('Dataset identifier'),
  limit: z.number().default(100).describe('Number of results'),
  offset: z.number().default(0).describe('Offset for pagination'),
});

export type GovernmentUSDatasetQuery = z.infer<typeof GovernmentUSDatasetQuerySchema>;

export const GovernmentUSDatasetDataSchema = z.object({
  title: z.string().describe('Dataset title'),
  description: z.string().optional().describe('Description'),
  modified: z.string().optional().describe('Last modified date'),
  publisher: z.string().optional().describe('Publisher'),
  keyword: z.array(z.string()).optional().describe('Keywords'),
  distribution: z.array(z.any()).optional().describe('Distribution links'),
});

export type GovernmentUSDatasetData = z.infer<typeof GovernmentUSDatasetDataSchema>;

export class GovernmentUSDatasetFetcher
  implements Fetcher<GovernmentUSDatasetQuery, GovernmentUSDatasetData>
{
  transformQuery(params: Partial<GovernmentUSDatasetQuery>): GovernmentUSDatasetQuery {
    return GovernmentUSDatasetQuerySchema.parse(params);
  }

  async extractData(
    query: GovernmentUSDatasetQuery,
    _credentials?: Record<string, string>
  ): Promise<any[]> {
    const url = `https://catalog.data.gov/api/3/action/package_show?id=${query.dataset_id}`;

    const response = await makeRequest(url);

    if (!response.success || !response.result) {
      throw new Error('No data returned from Data.gov API');
    }

    return [response.result];
  }

  transformData(_query: GovernmentUSDatasetQuery, data: any[]): GovernmentUSDatasetData[] {
    return data.map((item) =>
      GovernmentUSDatasetDataSchema.parse({
        title: item.title,
        description: item.notes,
        modified: item.metadata_modified,
        publisher: item.organization?.title,
        keyword: item.tags?.map((t: any) => t.name),
        distribution: item.resources,
      })
    );
  }
}
