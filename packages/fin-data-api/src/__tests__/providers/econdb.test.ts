/**
 * EconDB Provider Unit Tests
 */

import {
  EconDBEconomicDataFetcher,
  EconDBEconomicDataQuerySchema,
  EconDBEconomicDataDataSchema,
} from '../../providers/econdb/models/economicData';
import { testFetcherInterface } from '../utils/testHelpers';

describe('EconDB Provider', () => {
  testFetcherInterface(EconDBEconomicDataFetcher, 'EconDBEconomicDataFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { ticker: 'ticker/RGDP' };
      expect(() => EconDBEconomicDataQuerySchema.parse(query)).not.toThrow();
    });

    it('should require ticker', () => {
      expect(() => EconDBEconomicDataQuerySchema.parse({})).toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        date: '2023-01-01',
        value: 25000,
        ticker: 'ticker/RGDP',
      };
      expect(() => EconDBEconomicDataDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: EconDBEconomicDataFetcher;

    beforeEach(() => {
      fetcher = new EconDBEconomicDataFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ ticker: 'ticker/RGDP' });
      expect(query.ticker).toBe('ticker/RGDP');
    });
  });
});
