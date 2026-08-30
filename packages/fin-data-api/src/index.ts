/**
 * Financial Data API Server
 * Main Express application with Scalar OpenAPI documentation
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { apiReference } from '@scalar/express-api-reference';
import { generateOpenAPISpec } from './api/openapi';
import congressRouter from './api/routers/congressRouter';
import earningsRouter from './api/routers/earningsRouter';
import cftcRouter from './api/routers/cftcRouter';

// Load environment variables
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for Scalar docs to work
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Financial Data API',
    version: '1.0.0',
    description: 'TypeScript Financial Data API with OpenAPI/Scalar documentation',
    documentation: '/docs',
    endpoints: {
      congress_bills: '/api/congress/bills',
      earnings_calendar: '/api/earnings/calendar',
      cftc_cot: '/api/cftc/cot',
    },
  });
});

// API Routes
app.use('/api/congress', congressRouter);
app.use('/api/earnings', earningsRouter);
app.use('/api/cftc', cftcRouter);

// OpenAPI JSON endpoint
app.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(generateOpenAPISpec());
});

// Scalar API Documentation
app.use(
  '/docs',
  apiReference({
    spec: {
      content: generateOpenAPISpec(),
    },
    theme: 'purple',
    layout: 'modern',
    darkMode: true,
    searchHotKey: 'k',
    showSidebar: true,
  })
);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error',
    },
  });
});

// Start server
app.listen(port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           Financial Data API                                  ║
║           TypeScript Edition with Scalar Docs                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

🚀 Server running on: http://localhost:${port}
📚 API Documentation: http://localhost:${port}/docs
📄 OpenAPI Spec: http://localhost:${port}/openapi.json

Available Endpoints:
  - GET  /api/congress/bills      - Congressional Bills
  - GET  /api/earnings/calendar   - Earnings Calendar
  - GET  /api/cftc/cot           - CFTC COT Reports

Environment:
  - NODE_ENV: ${process.env.NODE_ENV || 'development'}
  - Congress.gov API Key: ${process.env.CONGRESS_GOV_API_KEY ? '✓ Set' : '✗ Not set'}
  - CFTC App Token: ${process.env.CFTC_APP_TOKEN ? '✓ Set' : '✗ Not set'}
  `);
});

export default app;
