/**
 * Earnings Router
 * API routes for earnings calendar data
 */

import { Router, Request, Response } from 'express';
import { SACalendarEarningsFetcher } from '../../providers/seeking_alpha/models/calendarEarnings';
import { createOBBject, createError } from '../../types/base';

const router: Router = Router();
const fetcher = new SACalendarEarningsFetcher();

/**
 * GET /api/earnings/calendar
 * Get Earnings Calendar
 */
router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const queryParams = {
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      country: (req.query.country as 'us' | 'ca') || 'us',
    };

    // Transform query
    const query = fetcher.transformQuery(queryParams);

    // Extract data
    const rawData = await fetcher.extractData(query);

    // Transform data
    const data = fetcher.transformData(query, rawData);

    // Return OBBject response
    const response = createOBBject(data, 'seeking_alpha');
    res.json(response);
  } catch (error: any) {
    console.error('Error in /api/earnings/calendar:', error);

    if (error.message?.includes('Invalid')) {
      res.status(400).json(createError('BAD_REQUEST', error.message));
    } else {
      res.status(500).json(createError('INTERNAL_ERROR', error.message || 'Internal server error'));
    }
  }
});

export default router;
