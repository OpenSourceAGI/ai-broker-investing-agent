/**
 * Government US Provider Unit Tests
 */

import {
  GovernmentUSDatasetFetcher,
  GovernmentUSDatasetQuerySchema,
  GovernmentUSDatasetDataSchema,
} from '../../providers/government_us/models/datasets';
import { testFetcherInterface } from '../utils/testHelpers';

describe('Government US Provider', () => {
  testFetcherInterface(GovernmentUSDatasetFetcher, 'GovernmentUSDatasetFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { dataset_id: 'treasury-rates' };
      expect(() => GovernmentUSDatasetQuerySchema.parse(query)).not.toThrow();
    });

    it('should require dataset_id', () => {
      expect(() => GovernmentUSDatasetQuerySchema.parse({})).toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        title: 'Daily Treasury Par Yield Curve Rates',
        description: 'Daily par yield curve rates published by the Treasury.',
        modified: '2023-01-01',
        publisher: 'U.S. Department of the Treasury',
      };
      expect(() => GovernmentUSDatasetDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: GovernmentUSDatasetFetcher;

    beforeEach(() => {
      fetcher = new GovernmentUSDatasetFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ dataset_id: 'treasury-rates' });
      expect(query.dataset_id).toBe('treasury-rates');
    });
  });
});
