/**
 * Stockgrid Provider Unit Tests
 */

import {
  StockgridOptionsFlowFetcher,
  StockgridOptionsFlowQuerySchema,
  StockgridOptionsFlowDataSchema,
} from '../../providers/stockgrid/models/optionsFlow';
import { testFetcherInterface } from '../utils/testHelpers';

describe('Stockgrid Provider', () => {
  testFetcherInterface(StockgridOptionsFlowFetcher, 'StockgridOptionsFlowFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { limit: 100 };
      expect(() => StockgridOptionsFlowQuerySchema.parse(query)).not.toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        timestamp: '2023-01-01T10:00:00Z',
        symbol: 'AAPL',
        strike: 150.0,
        expiration: '2023-12-31',
        option_type: 'CALL',
        premium: 500000,
        volume: 100,
      };
      expect(() => StockgridOptionsFlowDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: StockgridOptionsFlowFetcher;

    beforeEach(() => {
      fetcher = new StockgridOptionsFlowFetcher();
    });

    it('should require API key', async () => {
      const query = { limit: 10 };
      await expect(fetcher.extractData(query, {})).rejects.toThrow('Stockgrid API key is required');
    });
  });
});
