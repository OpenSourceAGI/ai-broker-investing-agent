/**
 * FinViz Provider Unit Tests
 */

import {
  FinVizQuoteFetcher,
  FinVizQuoteQuerySchema,
  FinVizQuoteDataSchema,
} from '../../providers/finviz/models/quote';
import { testFetcherInterface } from '../utils/testHelpers';

describe('FinViz Provider', () => {
  testFetcherInterface(FinVizQuoteFetcher, 'FinVizQuoteFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { symbol: 'AAPL' };
      expect(() => FinVizQuoteQuerySchema.parse(query)).not.toThrow();
    });

    it('should require symbol', () => {
      expect(() => FinVizQuoteQuerySchema.parse({})).toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        symbol: 'AAPL',
        price: '150.00',
        market_cap: '2.5T',
      };
      expect(() => FinVizQuoteDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: FinVizQuoteFetcher;

    beforeEach(() => {
      fetcher = new FinVizQuoteFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ symbol: 'AAPL' });
      expect(query.symbol).toBe('AAPL');
    });
  });
});
