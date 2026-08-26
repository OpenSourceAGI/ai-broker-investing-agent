/**
 * OpenAPI Schema Generator
 * Generates OpenAPI 3.0 specification from Zod schemas for all financial data providers
 */

import zodToJsonSchema from 'zod-to-json-schema';

// Import all provider schemas
import { AVEquityHistoricalQuerySchema, AVEquityHistoricalDataSchema } from '../providers/alpha_vantage/models/equityHistorical';
import { BenzingaWorldNewsQuerySchema, BenzingaWorldNewsDataSchema } from '../providers/benzinga/models/worldNews';
import { BizTocNewsQuerySchema, BizTocNewsDataSchema } from '../providers/biztoc/models/news';
import { BLSSeriesQuerySchema, BLSSeriesDataSchema } from '../providers/bls/models/series';
import { CBOEIndexQuerySchema, CBOEIndexDataSchema } from '../providers/cboe/models/index';
import { CftcCotQuerySchema, CftcCotDataSchema } from '../providers/cftc/models/cot';
import { CongressBillsQuerySchema, CongressBillsDataSchema } from '../providers/congress_gov/models/congressBills';
import { DeribitOptionsQuerySchema, DeribitOptionsDataSchema } from '../providers/deribit/models/options';
import { ECBExchangeRatesQuerySchema, ECBExchangeRatesDataSchema } from '../providers/ecb/models/exchangeRates';
import { EconDBEconomicDataQuerySchema, EconDBEconomicDataDataSchema } from '../providers/econdb/models/economicData';
import { EIASeriesQuerySchema, EIASeriesDataSchema } from '../providers/eia/models/series';
import { FamaFrenchFactorDataQuerySchema, FamaFrenchFactorDataDataSchema } from '../providers/famafrench/models/factorData';
import { FederalReserveInterestRatesQuerySchema, FederalReserveInterestRatesDataSchema } from '../providers/federal_reserve/models/interestRates';
import { FINRAShortInterestQuerySchema, FINRAShortInterestDataSchema } from '../providers/finra/models/shortInterest';
import { FinVizQuoteQuerySchema, FinVizQuoteDataSchema } from '../providers/finviz/models/quote';
import { FMPQuoteQuerySchema, FMPQuoteDataSchema } from '../providers/fmp/models/quote';
import { FREDSeriesQuerySchema, FREDSeriesDataSchema } from '../providers/fred/models/series';
import { GovernmentUSDatasetQuerySchema, GovernmentUSDatasetDataSchema } from '../providers/government_us/models/datasets';
import { IMFEconomicDataQuerySchema, IMFEconomicDataDataSchema } from '../providers/imf/models/economicData';
import { IntrinioStockPriceQuerySchema, IntrinioStockPriceDataSchema } from '../providers/intrinio/models/stockPrice';
import { MultplSP500MultiplesQuerySchema, MultplSP500MultiplesDataSchema } from '../providers/multpl/models/sp500Multiples';
import { NasdaqQuoteQuerySchema, NasdaqQuoteDataSchema } from '../providers/nasdaq/models/quote';
import { OECDEconomicDataQuerySchema, OECDEconomicDataDataSchema } from '../providers/oecd/models/economicData';
import { PolygonStockQuoteQuerySchema, PolygonStockQuoteDataSchema } from '../providers/polygon/models/stockQuote';
import { SECFilingsQuerySchema, SECFilingsDataSchema } from '../providers/sec/models/filings';
import { SACalendarEarningsQuerySchema, SACalendarEarningsDataSchema } from '../providers/seeking_alpha/models/calendarEarnings';
import { StockgridOptionsFlowQuerySchema, StockgridOptionsFlowDataSchema } from '../providers/stockgrid/models/optionsFlow';
import { TiingoStockPriceQuerySchema, TiingoStockPriceDataSchema } from '../providers/tiingo/models/stockPrice';
import { TMXQuoteQuerySchema, TMXQuoteDataSchema } from '../providers/tmx/models/quote';
import { TradierQuoteQuerySchema, TradierQuoteDataSchema } from '../providers/tradier/models/quote';
import { TradingEconomicsIndicatorsQuerySchema, TradingEconomicsIndicatorsDataSchema } from '../providers/tradingeconomics/models/indicators';
import { WSJMarketMoversQuerySchema, WSJMarketMoversDataSchema } from '../providers/wsj/models/marketMovers';
import { YFinanceQuoteQuerySchema, YFinanceQuoteDataSchema } from '../providers/yfinance/models/quote';

/**
 * Generate OpenAPI 3.0 Specification
 */
export function generateOpenAPISpec(): Record<string, unknown> {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Financial Data API',
      version: '1.0.0',
      description:
        'Comprehensive TypeScript Financial Data API with 33+ data providers including market data, economic indicators, ' +
        'news, government data, and more. Converted from OpenBB Finance APIs with enhanced TypeScript support and Scalar documentation.',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://api.example.com',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Market Data',
        description: 'Stock quotes, historical prices, and market data',
      },
      {
        name: 'Economic Data',
        description: 'Economic indicators, statistics, and macroeconomic data',
      },
      {
        name: 'News',
        description: 'Financial news and market information',
      },
      {
        name: 'Government',
        description: 'U.S. government data including Congress, SEC, and regulatory bodies',
      },
      {
        name: 'Options & Derivatives',
        description: 'Options data, derivatives, and related information',
      },
      {
        name: 'International',
        description: 'International exchanges and central bank data',
      },
      {
        name: 'Research',
        description: 'Academic research data and factor models',
      },
    ],
    paths: {
      // Market Data Providers
      '/api/alpha-vantage/equity-historical': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Historical Equity Prices (Alpha Vantage)',
          description: 'Retrieve historical stock prices with various intervals and adjustments from Alpha Vantage.',
          operationId: 'getAlphaVantageEquityHistorical',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date (YYYY-MM-DD)' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date (YYYY-MM-DD)' },
            { name: 'interval', in: 'query', schema: { type: 'string', enum: ['1m', '5m', '15m', '30m', '60m', '1d', '1W', '1M'], default: '1d' }, description: 'Data interval' },
            { name: 'adjustment', in: 'query', schema: { type: 'string', enum: ['splits_only', 'splits_and_dividends', 'unadjusted'], default: 'splits_only' } },
            { name: 'extended_hours', in: 'query', schema: { type: 'boolean', default: false }, description: 'Include pre/post market data' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(AVEquityHistoricalDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '401': { description: 'Unauthorized - Missing or invalid API key' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/fmp/quote': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Stock Quote (FMP)',
          description: 'Retrieve real-time stock quotes from Financial Modeling Prep.',
          operationId: 'getFMPQuote',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(FMPQuoteDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/polygon/stock-quote': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Stock Quote (Polygon)',
          description: 'Retrieve real-time stock quotes from Polygon.io.',
          operationId: 'getPolygonStockQuote',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(PolygonStockQuoteDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/yfinance/quote': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Stock Quote (Yahoo Finance)',
          description: 'Retrieve real-time stock quotes from Yahoo Finance.',
          operationId: 'getYFinanceQuote',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(YFinanceQuoteDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/finviz/quote': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Stock Quote (FinViz)',
          description: 'Retrieve stock quotes and fundamental data from FinViz.',
          operationId: 'getFinVizQuote',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(FinVizQuoteDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/nasdaq/quote': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Stock Quote (NASDAQ)',
          description: 'Retrieve stock quotes from NASDAQ.',
          operationId: 'getNasdaqQuote',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(NasdaqQuoteDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/intrinio/stock-price': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Stock Price (Intrinio)',
          description: 'Retrieve stock prices from Intrinio.',
          operationId: 'getIntrinioStockPrice',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(IntrinioStockPriceDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/tiingo/stock-price': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Stock Price (Tiingo)',
          description: 'Retrieve stock prices from Tiingo.',
          operationId: 'getTiingoStockPrice',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(TiingoStockPriceDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/tradier/quote': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Stock Quote (Tradier)',
          description: 'Retrieve stock quotes from Tradier.',
          operationId: 'getTradierQuote',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(TradierQuoteDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },

      // Economic Data Providers
      '/api/fred/series': {
        get: {
          tags: ['Economic Data'],
          summary: 'Get Economic Series (FRED)',
          description: 'Retrieve economic data series from Federal Reserve Economic Data (FRED).',
          operationId: 'getFREDSeries',
          parameters: [
            { name: 'series_id', in: 'query', required: true, schema: { type: 'string' }, description: 'FRED series ID' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
            { name: 'frequency', in: 'query', schema: { type: 'string', enum: ['d', 'w', 'bw', 'm', 'q', 'sa', 'a'] }, description: 'Frequency' },
            { name: 'aggregation_method', in: 'query', schema: { type: 'string', enum: ['avg', 'sum', 'eop'], default: 'avg' } },
            { name: 'transform', in: 'query', schema: { type: 'string', enum: ['chg', 'ch1', 'pch', 'pc1', 'pca', 'cch', 'cca', 'log'] } },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(FREDSeriesDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/bls/series': {
        get: {
          tags: ['Economic Data'],
          summary: 'Get Labor Statistics (BLS)',
          description: 'Retrieve labor statistics from the Bureau of Labor Statistics.',
          operationId: 'getBLSSeries',
          parameters: [
            { name: 'series_id', in: 'query', required: true, schema: { type: 'string' }, description: 'BLS series ID' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(BLSSeriesDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/eia/series': {
        get: {
          tags: ['Economic Data'],
          summary: 'Get Energy Data (EIA)',
          description: 'Retrieve energy statistics from the Energy Information Administration.',
          operationId: 'getEIASeries',
          parameters: [
            { name: 'series_id', in: 'query', required: true, schema: { type: 'string' }, description: 'EIA series ID' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(EIASeriesDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/imf/economic-data': {
        get: {
          tags: ['Economic Data'],
          summary: 'Get Economic Data (IMF)',
          description: 'Retrieve economic data from the International Monetary Fund.',
          operationId: 'getIMFEconomicData',
          parameters: [
            { name: 'indicator', in: 'query', required: true, schema: { type: 'string' }, description: 'Economic indicator' },
            { name: 'country', in: 'query', schema: { type: 'string' }, description: 'Country code' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(IMFEconomicDataDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/oecd/economic-data': {
        get: {
          tags: ['Economic Data'],
          summary: 'Get Economic Data (OECD)',
          description: 'Retrieve economic data from the Organisation for Economic Co-operation and Development.',
          operationId: 'getOECDEconomicData',
          parameters: [
            { name: 'indicator', in: 'query', required: true, schema: { type: 'string' }, description: 'Economic indicator' },
            { name: 'country', in: 'query', schema: { type: 'string' }, description: 'Country code' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(OECDEconomicDataDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/econdb/economic-data': {
        get: {
          tags: ['Economic Data'],
          summary: 'Get Economic Data (EconDB)',
          description: 'Retrieve economic data from EconDB.',
          operationId: 'getEconDBEconomicData',
          parameters: [
            { name: 'dataset', in: 'query', required: true, schema: { type: 'string' }, description: 'Dataset name' },
            { name: 'country', in: 'query', schema: { type: 'string' }, description: 'Country code' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(EconDBEconomicDataDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/tradingeconomics/indicators': {
        get: {
          tags: ['Economic Data'],
          summary: 'Get Economic Indicators (Trading Economics)',
          description: 'Retrieve economic indicators from Trading Economics.',
          operationId: 'getTradingEconomicsIndicators',
          parameters: [
            { name: 'country', in: 'query', required: true, schema: { type: 'string' }, description: 'Country name or code' },
            { name: 'indicator', in: 'query', schema: { type: 'string' }, description: 'Indicator name' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(TradingEconomicsIndicatorsDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/federal-reserve/interest-rates': {
        get: {
          tags: ['Economic Data'],
          summary: 'Get Interest Rates (Federal Reserve)',
          description: 'Retrieve interest rates from the Federal Reserve.',
          operationId: 'getFederalReserveInterestRates',
          parameters: [
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(FederalReserveInterestRatesDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },

      // News Providers
      '/api/benzinga/world-news': {
        get: {
          tags: ['News'],
          summary: 'Get World News (Benzinga)',
          description: 'Retrieve financial news from Benzinga.',
          operationId: 'getBenzingaWorldNews',
          parameters: [
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 }, description: 'Number of results' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(BenzingaWorldNewsDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/biztoc/news': {
        get: {
          tags: ['News'],
          summary: 'Get Business News (BizToc)',
          description: 'Retrieve business news from BizToc.',
          operationId: 'getBizTocNews',
          parameters: [
            { name: 'symbol', in: 'query', schema: { type: 'string' }, description: 'Stock ticker symbol' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Number of results' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(BizTocNewsDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/wsj/market-movers': {
        get: {
          tags: ['News'],
          summary: 'Get Market Movers (WSJ)',
          description: 'Retrieve market movers from Wall Street Journal.',
          operationId: 'getWSJMarketMovers',
          parameters: [
            { name: 'category', in: 'query', schema: { type: 'string', enum: ['gainers', 'losers', 'actives'] }, description: 'Market mover category' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(WSJMarketMoversDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },

      // Government & Regulatory
      '/api/congress/bills': {
        get: {
          tags: ['Government'],
          summary: 'Get Congressional Bills',
          description: 'Retrieve U.S. Congressional bills with filtering options.',
          operationId: 'getCongressBills',
          parameters: [
            { name: 'congress', in: 'query', schema: { type: 'integer' }, description: 'Congress number' },
            { name: 'bill_type', in: 'query', schema: { type: 'string', enum: ['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'] } },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 }, description: 'Max results' },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 }, description: 'Skip results' },
            { name: 'sort_by', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(CongressBillsDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/sec/filings': {
        get: {
          tags: ['Government'],
          summary: 'Get SEC Filings',
          description: 'Retrieve SEC filings for companies.',
          operationId: 'getSECFilings',
          parameters: [
            { name: 'symbol', in: 'query', schema: { type: 'string' }, description: 'Stock ticker symbol' },
            { name: 'cik', in: 'query', schema: { type: 'string' }, description: 'CIK number' },
            { name: 'form_type', in: 'query', schema: { type: 'string' }, description: 'Filing form type (e.g., 10-K, 10-Q)' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 }, description: 'Max results' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(SECFilingsDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/cftc/cot': {
        get: {
          tags: ['Government'],
          summary: 'Get Commitment of Traders Report (CFTC)',
          description: 'Retrieve CFTC Commitment of Traders reports.',
          operationId: 'getCftcCot',
          parameters: [
            { name: 'id', in: 'query', schema: { type: 'string', default: 'all' }, description: 'Commodity code or "all"' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
            { name: 'report_type', in: 'query', schema: { type: 'string', enum: ['legacy', 'disaggregated', 'financial', 'supplemental'], default: 'legacy' } },
            { name: 'futures_only', in: 'query', schema: { type: 'boolean', default: false } },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(CftcCotDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/finra/short-interest': {
        get: {
          tags: ['Government'],
          summary: 'Get Short Interest (FINRA)',
          description: 'Retrieve short interest data from FINRA.',
          operationId: 'getFINRAShortInterest',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(FINRAShortInterestDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/government-us/datasets': {
        get: {
          tags: ['Government'],
          summary: 'Get Government Datasets',
          description: 'Retrieve datasets from U.S. government sources.',
          operationId: 'getGovernmentUSDatasets',
          parameters: [
            { name: 'dataset', in: 'query', required: true, schema: { type: 'string' }, description: 'Dataset identifier' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(GovernmentUSDatasetDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },

      // Options & Derivatives
      '/api/cboe/index': {
        get: {
          tags: ['Options & Derivatives'],
          summary: 'Get CBOE Index Data',
          description: 'Retrieve index data from Chicago Board Options Exchange.',
          operationId: 'getCBOEIndex',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Index symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(CBOEIndexDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/deribit/options': {
        get: {
          tags: ['Options & Derivatives'],
          summary: 'Get Options Data (Deribit)',
          description: 'Retrieve cryptocurrency options data from Deribit.',
          operationId: 'getDeribitOptions',
          parameters: [
            { name: 'currency', in: 'query', required: true, schema: { type: 'string' }, description: 'Currency (BTC, ETH)' },
            { name: 'kind', in: 'query', schema: { type: 'string', enum: ['future', 'option'] }, description: 'Instrument kind' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(DeribitOptionsDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/stockgrid/options-flow': {
        get: {
          tags: ['Options & Derivatives'],
          summary: 'Get Options Flow (Stockgrid)',
          description: 'Retrieve options flow data from Stockgrid.',
          operationId: 'getStockgridOptionsFlow',
          parameters: [
            { name: 'symbol', in: 'query', schema: { type: 'string' }, description: 'Stock ticker symbol' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 }, description: 'Max results' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(StockgridOptionsFlowDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },

      // International
      '/api/tmx/quote': {
        get: {
          tags: ['International'],
          summary: 'Get Stock Quote (TMX - Toronto)',
          description: 'Retrieve stock quotes from Toronto Stock Exchange.',
          operationId: 'getTMXQuote',
          parameters: [
            { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, description: 'Stock ticker symbol' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(TMXQuoteDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/ecb/exchange-rates': {
        get: {
          tags: ['International'],
          summary: 'Get Exchange Rates (ECB)',
          description: 'Retrieve exchange rates from European Central Bank.',
          operationId: 'getECBExchangeRates',
          parameters: [
            { name: 'currency', in: 'query', schema: { type: 'string' }, description: 'Currency code' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(ECBExchangeRatesDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },

      // Research & Academic
      '/api/famafrench/factor-data': {
        get: {
          tags: ['Research'],
          summary: 'Get Fama-French Factor Data',
          description: 'Retrieve Fama-French factor model data for academic research.',
          operationId: 'getFamaFrenchFactorData',
          parameters: [
            { name: 'factor', in: 'query', required: true, schema: { type: 'string' }, description: 'Factor name' },
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(FamaFrenchFactorDataDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
      '/api/multpl/sp500-multiples': {
        get: {
          tags: ['Research'],
          summary: 'Get S&P 500 Multiples',
          description: 'Retrieve historical S&P 500 valuation multiples.',
          operationId: 'getMultplSP500Multiples',
          parameters: [
            { name: 'metric', in: 'query', required: true, schema: { type: 'string' }, description: 'Valuation metric (PE, PS, PB, etc.)' },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(MultplSP500MultiplesDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },

      // Earnings
      '/api/earnings/calendar': {
        get: {
          tags: ['Market Data'],
          summary: 'Get Earnings Calendar (Seeking Alpha)',
          description: 'Retrieve earnings calendar data.',
          operationId: 'getEarningsCalendar',
          parameters: [
            { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Start date' },
            { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'End date' },
            { name: 'country', in: 'query', schema: { type: 'string', enum: ['us', 'ca'], default: 'us' } },
          ],
          responses: {
            '200': {
              description: 'Successful response',
              content: { 'application/json': { schema: { type: 'object', properties: { results: { type: 'array', items: zodToJsonSchema(SACalendarEarningsDataSchema) }, provider: { type: 'string' } } } } },
            },
            '400': { description: 'Bad request' },
            '500': { description: 'Internal server error' },
          },
        },
      },
    },
    components: {
      schemas: {
        // Market Data Schemas
        AVEquityHistoricalQuery: zodToJsonSchema(AVEquityHistoricalQuerySchema),
        AVEquityHistoricalData: zodToJsonSchema(AVEquityHistoricalDataSchema),
        FMPQuoteQuery: zodToJsonSchema(FMPQuoteQuerySchema),
        FMPQuoteData: zodToJsonSchema(FMPQuoteDataSchema),
        PolygonStockQuoteQuery: zodToJsonSchema(PolygonStockQuoteQuerySchema),
        PolygonStockQuoteData: zodToJsonSchema(PolygonStockQuoteDataSchema),
        YFinanceQuoteQuery: zodToJsonSchema(YFinanceQuoteQuerySchema),
        YFinanceQuoteData: zodToJsonSchema(YFinanceQuoteDataSchema),
        FinVizQuoteQuery: zodToJsonSchema(FinVizQuoteQuerySchema),
        FinVizQuoteData: zodToJsonSchema(FinVizQuoteDataSchema),
        NasdaqQuoteQuery: zodToJsonSchema(NasdaqQuoteQuerySchema),
        NasdaqQuoteData: zodToJsonSchema(NasdaqQuoteDataSchema),
        IntrinioStockPriceQuery: zodToJsonSchema(IntrinioStockPriceQuerySchema),
        IntrinioStockPriceData: zodToJsonSchema(IntrinioStockPriceDataSchema),
        TiingoStockPriceQuery: zodToJsonSchema(TiingoStockPriceQuerySchema),
        TiingoStockPriceData: zodToJsonSchema(TiingoStockPriceDataSchema),
        TradierQuoteQuery: zodToJsonSchema(TradierQuoteQuerySchema),
        TradierQuoteData: zodToJsonSchema(TradierQuoteDataSchema),

        // Economic Data Schemas
        FREDSeriesQuery: zodToJsonSchema(FREDSeriesQuerySchema),
        FREDSeriesData: zodToJsonSchema(FREDSeriesDataSchema),
        BLSSeriesQuery: zodToJsonSchema(BLSSeriesQuerySchema),
        BLSSeriesData: zodToJsonSchema(BLSSeriesDataSchema),
        EIASeriesQuery: zodToJsonSchema(EIASeriesQuerySchema),
        EIASeriesData: zodToJsonSchema(EIASeriesDataSchema),
        IMFEconomicDataQuery: zodToJsonSchema(IMFEconomicDataQuerySchema),
        IMFEconomicDataData: zodToJsonSchema(IMFEconomicDataDataSchema),
        OECDEconomicDataQuery: zodToJsonSchema(OECDEconomicDataQuerySchema),
        OECDEconomicDataData: zodToJsonSchema(OECDEconomicDataDataSchema),
        EconDBEconomicDataQuery: zodToJsonSchema(EconDBEconomicDataQuerySchema),
        EconDBEconomicDataData: zodToJsonSchema(EconDBEconomicDataDataSchema),
        TradingEconomicsIndicatorsQuery: zodToJsonSchema(TradingEconomicsIndicatorsQuerySchema),
        TradingEconomicsIndicatorsData: zodToJsonSchema(TradingEconomicsIndicatorsDataSchema),
        FederalReserveInterestRatesQuery: zodToJsonSchema(FederalReserveInterestRatesQuerySchema),
        FederalReserveInterestRatesData: zodToJsonSchema(FederalReserveInterestRatesDataSchema),

        // News Schemas
        BenzingaWorldNewsQuery: zodToJsonSchema(BenzingaWorldNewsQuerySchema),
        BenzingaWorldNewsData: zodToJsonSchema(BenzingaWorldNewsDataSchema),
        BizTocNewsQuery: zodToJsonSchema(BizTocNewsQuerySchema),
        BizTocNewsData: zodToJsonSchema(BizTocNewsDataSchema),
        WSJMarketMoversQuery: zodToJsonSchema(WSJMarketMoversQuerySchema),
        WSJMarketMoversData: zodToJsonSchema(WSJMarketMoversDataSchema),

        // Government Schemas
        CongressBillsQuery: zodToJsonSchema(CongressBillsQuerySchema),
        CongressBillsData: zodToJsonSchema(CongressBillsDataSchema),
        SECFilingsQuery: zodToJsonSchema(SECFilingsQuerySchema),
        SECFilingsData: zodToJsonSchema(SECFilingsDataSchema),
        CftcCotQuery: zodToJsonSchema(CftcCotQuerySchema),
        CftcCotData: zodToJsonSchema(CftcCotDataSchema),
        FINRAShortInterestQuery: zodToJsonSchema(FINRAShortInterestQuerySchema),
        FINRAShortInterestData: zodToJsonSchema(FINRAShortInterestDataSchema),
        GovernmentUSDatasetQuery: zodToJsonSchema(GovernmentUSDatasetQuerySchema),
        GovernmentUSDatasetData: zodToJsonSchema(GovernmentUSDatasetDataSchema),

        // Options & Derivatives Schemas
        CBOEIndexQuery: zodToJsonSchema(CBOEIndexQuerySchema),
        CBOEIndexData: zodToJsonSchema(CBOEIndexDataSchema),
        DeribitOptionsQuery: zodToJsonSchema(DeribitOptionsQuerySchema),
        DeribitOptionsData: zodToJsonSchema(DeribitOptionsDataSchema),
        StockgridOptionsFlowQuery: zodToJsonSchema(StockgridOptionsFlowQuerySchema),
        StockgridOptionsFlowData: zodToJsonSchema(StockgridOptionsFlowDataSchema),

        // International Schemas
        TMXQuoteQuery: zodToJsonSchema(TMXQuoteQuerySchema),
        TMXQuoteData: zodToJsonSchema(TMXQuoteDataSchema),
        ECBExchangeRatesQuery: zodToJsonSchema(ECBExchangeRatesQuerySchema),
        ECBExchangeRatesData: zodToJsonSchema(ECBExchangeRatesDataSchema),

        // Research Schemas
        FamaFrenchFactorDataQuery: zodToJsonSchema(FamaFrenchFactorDataQuerySchema),
        FamaFrenchFactorDataData: zodToJsonSchema(FamaFrenchFactorDataDataSchema),
        MultplSP500MultiplesQuery: zodToJsonSchema(MultplSP500MultiplesQuerySchema),
        MultplSP500MultiplesData: zodToJsonSchema(MultplSP500MultiplesDataSchema),

        // Earnings Schemas
        SACalendarEarningsQuery: zodToJsonSchema(SACalendarEarningsQuerySchema),
        SACalendarEarningsData: zodToJsonSchema(SACalendarEarningsDataSchema),
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication',
        },
      },
    },
  };
}
