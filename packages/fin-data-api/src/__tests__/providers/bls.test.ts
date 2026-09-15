/**
 * BLS (Bureau of Labor Statistics) Provider Unit Tests
 */

import {
  BLSSeriesFetcher,
  BLSSeriesQuerySchema,
  BLSSeriesDataSchema,
} from '../../providers/bls/models/series';
import { testFetcherInterface } from '../utils/testHelpers';

describe('BLS Provider', () => {
  testFetcherInterface(BLSSeriesFetcher, 'BLSSeriesFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { series_id: 'CUUR0000SA0' };
      expect(() => BLSSeriesQuerySchema.parse(query)).not.toThrow();
    });

    it('should require series_id', () => {
      expect(() => BLSSeriesQuerySchema.parse({})).toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        date: '2023-01-01',
        value: 300.5,
        series_id: 'CUUR0000SA0',
        year: '2023',
        period: 'M01',
      };
      expect(() => BLSSeriesDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: BLSSeriesFetcher;

    beforeEach(() => {
      fetcher = new BLSSeriesFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ series_id: 'TEST' });
      expect(query.series_id).toBe('TEST');
    });
  });
});
