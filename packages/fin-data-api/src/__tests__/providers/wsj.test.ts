/**
 * WSJ (Wall Street Journal) Provider Unit Tests
 */

import {
  WSJMarketMoversFetcher,
  WSJMarketMoversQuerySchema,
  WSJMarketMoversDataSchema,
} from '../../providers/wsj/models/marketMovers';
import { testFetcherInterface } from '../utils/testHelpers';

describe('WSJ Provider', () => {
  testFetcherInterface(WSJMarketMoversFetcher, 'WSJMarketMoversFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { type: 'gainers' };
      expect(() => WSJMarketMoversQuerySchema.parse(query)).not.toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        last_price: 150.0,
        change: 5.0,
        percent_change: 3.45,
      };
      expect(() => WSJMarketMoversDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: WSJMarketMoversFetcher;

    beforeEach(() => {
      fetcher = new WSJMarketMoversFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ type: 'gainers' });
      expect(query.type).toBe('gainers');
    });
  });
});
