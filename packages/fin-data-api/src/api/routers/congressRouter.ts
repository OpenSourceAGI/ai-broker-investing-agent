/**
 * Congress Router
 * API routes for Congressional data
 */

import { Router, Request, Response } from 'express';
import { CongressBillsFetcher } from '../../providers/congress_gov/models/congressBills';
import { createOBBject, createError } from '../../types/base';

const router: Router = Router();
const fetcher = new CongressBillsFetcher();

/**
 * GET /api/congress/bills
 * Get Congressional Bills
 */
router.get('/bills', async (req: Request, res: Response) => {
  try {
    const queryParams = {
      congress: req.query.congress ? parseInt(req.query.congress as string) : undefined,
      bill_type: req.query.bill_type as any,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
      sort_by: (req.query.sort_by as 'asc' | 'desc') || 'desc',
    };

    // Get credentials from environment or request headers
    const credentials = {
      congress_gov_api_key: process.env.CONGRESS_GOV_API_KEY || (req.headers['x-congress-api-key'] as string) || '',
    };

    // Transform query
    const query = fetcher.transformQuery(queryParams);

    // Extract data
    const rawData = await fetcher.extractData(query, credentials);

    // Transform data
    const data = fetcher.transformData(query, rawData);

    // Return OBBject response
    const response = createOBBject(data, 'congress_gov');
    res.json(response);
  } catch (error: any) {
    console.error('Error in /api/congress/bills:', error);

    if (error.message?.includes('Missing credentials')) {
      res.status(401).json(createError('UNAUTHORIZED', error.message));
    } else if (error.message?.includes('Invalid')) {
      res.status(400).json(createError('BAD_REQUEST', error.message));
    } else {
      res.status(500).json(createError('INTERNAL_ERROR', error.message || 'Internal server error'));
    }
  }
});

export default router;
