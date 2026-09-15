/**
 * Congress.gov Provider Unit Tests
 */

import {
  CongressBillsFetcher,
  CongressBillsQuerySchema,
  CongressBillsDataSchema,
} from '../../providers/congress_gov/models/congressBills';
import { testFetcherInterface } from '../utils/testHelpers';

describe('Congress.gov Provider', () => {
  testFetcherInterface(CongressBillsFetcher, 'CongressBillsFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { congress: 118 };
      expect(() => CongressBillsQuerySchema.parse(query)).not.toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        update_date: '2023-01-01',
        bill_url: 'https://api.congress.gov/v3/bill/118/hr/1234',
        congress: 118,
        bill_number: 1234,
        origin_chamber: 'House',
        origin_chamber_code: 'H',
        bill_type: 'HR',
        title: 'Test Bill',
      };
      expect(() => CongressBillsDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: CongressBillsFetcher;

    beforeEach(() => {
      fetcher = new CongressBillsFetcher();
    });

    it('should require API key', async () => {
      const query = CongressBillsQuerySchema.parse({ congress: 118 });
      await expect(fetcher.extractData(query, {})).rejects.toThrow(
        'Missing credentials: congress_gov_api_key'
      );
    });
  });
});
