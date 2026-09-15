/**
 * Seeking Alpha Provider Unit Tests
 */

import {
  SACalendarEarningsFetcher,
  SACalendarEarningsQuerySchema,
  SACalendarEarningsDataSchema,
} from '../../providers/seeking_alpha/models/calendarEarnings';
import { testFetcherInterface } from '../utils/testHelpers';

describe('Seeking Alpha Provider', () => {
  testFetcherInterface(SACalendarEarningsFetcher, 'SACalendarEarningsFetcher');

  describe('Query Schema', () => {
    it('should validate correct query', () => {
      const query = { start_date: '2023-01-01', end_date: '2023-01-04' };
      expect(() => SACalendarEarningsQuerySchema.parse(query)).not.toThrow();
    });
  });

  describe('Data Schema', () => {
    it('should validate correct data', () => {
      const data = {
        report_date: '2023-01-01',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        reporting_time: 'AMC',
      };
      expect(() => SACalendarEarningsDataSchema.parse(data)).not.toThrow();
    });
  });

  describe('Fetcher Methods', () => {
    let fetcher: SACalendarEarningsFetcher;

    beforeEach(() => {
      fetcher = new SACalendarEarningsFetcher();
    });

    it('should transform query', () => {
      const query = fetcher.transformQuery({ start_date: '2023-01-01' });
      expect(query.start_date).toBe('2023-01-01');
      expect(query.country).toBe('us');
    });
  });
});
