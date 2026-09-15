/**
 * FINRA Provider Unit Tests
 */

import {
  FINRAShortInterestFetcher,
  FINRAShortInterestQuerySchema,
  FINRAShortInterestDataSchema,
} from '../../providers/finra/models/shortInterest';
import { testFetcherInterface } from '../utils/testHelpers';

describe('FINRA Provider', () => {
  testFetcherInterface(FINRAShortInterestFetcher, 'FINRAShortInterestFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { symbol: 'AAPL' };
      expect(() => FINRAShortInterestQuerySchema.parse(query)).not.toThrow();
    });

    it('should require symbol', () => {
      expect(() => FINRAShortInterestQuerySchema.parse({})).toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        settlement_date: '2023-01-01',
        symbol: 'AAPL',
        short_interest: 100000000,
        avg_daily_volume: 50000000,
        days_to_cover: 2.0,
      };
      expect(() => FINRAShortInterestDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: FINRAShortInterestFetcher;

    beforeEach(() => {
      fetcher = new FINRAShortInterestFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ symbol: 'AAPL' });
      expect(query.symbol).toBe('AAPL');
    });
  });
});
