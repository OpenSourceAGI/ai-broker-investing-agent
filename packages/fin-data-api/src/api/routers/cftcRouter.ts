/**
 * CFTC Router
 * API routes for CFTC data
 */

import { Router, Request, Response } from 'express';
import { CftcCotFetcher } from '../../providers/cftc/models/cot';
import { createOBBject, createError } from '../../types/base';

const router: Router = Router();
const fetcher = new CftcCotFetcher();

/**
 * GET /api/cftc/cot
 * Get CFTC Commitment of Traders Report
 */
router.get('/cot', async (req: Request, res: Response) => {
  try {
    const queryParams = {
      id: (req.query.id as string) || 'all',
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      report_type: (req.query.report_type as any) || 'legacy',
      futures_only: req.query.futures_only === 'true',
    };

    // Get credentials from environment or request headers
    const credentials = {
      cftc_app_token: process.env.CFTC_APP_TOKEN || (req.headers['x-cftc-app-token'] as string) || '',
    };

    // Transform query
    const query = fetcher.transformQuery(queryParams);

    // Extract data
    const rawData = await fetcher.extractData(query, credentials);

    // Transform data
    const data = fetcher.transformData(query, rawData);

    // Return OBBject response
    const response = createOBBject(data, 'cftc');
    res.json(response);
  } catch (error: any) {
    console.error('Error in /api/cftc/cot:', error);

    if (error.message?.includes('No data found')) {
      res.status(404).json(createError('NOT_FOUND', error.message));
    } else if (error.message?.includes('Invalid')) {
      res.status(400).json(createError('BAD_REQUEST', error.message));
    } else {
      res.status(500).json(createError('INTERNAL_ERROR', error.message || 'Internal server error'));
    }
  }
});

export default router;
