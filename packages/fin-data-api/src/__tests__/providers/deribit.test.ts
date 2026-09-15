/**
 * Deribit Provider Unit Tests
 */

import {
  DeribitOptionsFetcher,
  DeribitOptionsQuerySchema,
  DeribitOptionsDataSchema,
} from '../../providers/deribit/models/options';
import { testFetcherInterface } from '../utils/testHelpers';

describe('Deribit Provider', () => {
  testFetcherInterface(DeribitOptionsFetcher, 'DeribitOptionsFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { currency: 'BTC' };
      expect(() => DeribitOptionsQuerySchema.parse(query)).not.toThrow();
    });

    it('should default currency to BTC when omitted', () => {
      expect(DeribitOptionsQuerySchema.parse({}).currency).toBe('BTC');
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        instrument_name: 'BTC-31MAR23-20000-C',
        creation_timestamp: 1672531200000,
        expiration_timestamp: 1680249600000,
        strike: 20000,
        option_type: 'call',
        settlement_period: 'month',
        is_active: true,
        tick_size: 0.0005,
        min_trade_amount: 0.1,
      };
      expect(() => DeribitOptionsDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: DeribitOptionsFetcher;

    beforeEach(() => {
      fetcher = new DeribitOptionsFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ currency: 'BTC' });
      expect(query.currency).toBe('BTC');
    });
  });
});
