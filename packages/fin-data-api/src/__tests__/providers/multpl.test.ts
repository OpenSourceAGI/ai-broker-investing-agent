/**
 * Multpl Provider Unit Tests
 */

import {
  MultplSP500MultiplesFetcher,
  MultplSP500MultiplesQuerySchema,
  MultplSP500MultiplesDataSchema,
} from '../../providers/multpl/models/sp500Multiples';
import { testFetcherInterface } from '../utils/testHelpers';

describe('Multpl Provider', () => {
  testFetcherInterface(MultplSP500MultiplesFetcher, 'MultplSP500MultiplesFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { series_name: 'pe_ratio_month' };
      expect(() => MultplSP500MultiplesQuerySchema.parse(query)).not.toThrow();
    });

    it('should default series_name when omitted', () => {
      expect(MultplSP500MultiplesQuerySchema.parse({}).series_name).toBe('shiller_pe_month');
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        date: '2023-01-01',
        value: 20.5,
        name: 'shiller_pe_month',
      };
      expect(() => MultplSP500MultiplesDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: MultplSP500MultiplesFetcher;

    beforeEach(() => {
      fetcher = new MultplSP500MultiplesFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ series_name: 'pe_ratio_month' });
      expect(query.series_name).toBe('pe_ratio_month');
    });
  });
});
