// Historical Stock Data API Route
import { NextRequest, NextResponse } from 'next/server';
import { FinnhubWrapper } from '@/packages/investing/src/stocks/finnhub-wrapper';
import { quoteCacheService } from '@/packages/investing/src/stocks/quote-cache-service';

const finnhub = new FinnhubWrapper();

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    let symbol = '';
    try {
        const paramsValue = await params;
        symbol = paramsValue.symbol;
        const { searchParams } = new URL(request.url);

        // Get parameters with defaults
        const interval = searchParams.get('interval') || '1d';
        const range = searchParams.get('range') || '1mo'; // default to 1 month
        const useCache = searchParams.get('cache') !== 'false'; // Use cache by default

        // Allow either period1/period2 OR range
        const period1Param = searchParams.get('period1');
        const period2Param = searchParams.get('period2');

        let queryOptions: any = {
            interval: interval as any
        };

        // If period1 and period2 are provided, use them
        if (period1Param && period2Param) {
            queryOptions.period1 = period1Param;
            queryOptions.period2 = period2Param;
        } else {
            // Calculate start date based on range
            const now = new Date();
            let startDate = new Date();
            
            switch(range) {
                case '1d':
                    startDate.setDate(now.getDate() - 1);
                    break;
                case '5d':
                    startDate.setDate(now.getDate() - 5);
                    break;
                case '1mo':
                    startDate.setMonth(now.getMonth() - 1);
                    break;
                case '3mo':
                    startDate.setMonth(now.getMonth() - 3);
                    break;
                case '6mo':
                    startDate.setMonth(now.getMonth() - 6);
                    break;
                case '1y':
                    startDate.setFullYear(now.getFullYear() - 1);
                    break;
                case '2y':
                    startDate.setFullYear(now.getFullYear() - 2);
                    break;
                case '5y':
                    startDate.setFullYear(now.getFullYear() - 5);
                    break;
                case '10y':
                    startDate.setFullYear(now.getFullYear() - 10);
                    break;
                case 'ytd':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                case 'max':
                    startDate = new Date(1970, 0, 1);
                    break;
                default:
                    // Default to 1 month if invalid range
                    startDate.setMonth(now.getMonth() - 1);
            }
            
            queryOptions.period1 = startDate;
        }

        console.log(`Fetching historical data for ${symbol} with options:`, queryOptions);

        // Calculate end date (period2) if not provided
        const endDate = queryOptions.period2 || new Date();

        // Try to get cached data first (only for 1d interval)
        let cachedQuotes: any[] = [];
        if (useCache && interval === '1d') {
            const startDateStr = typeof queryOptions.period1 === 'string'
                ? queryOptions.period1
                : queryOptions.period1.toISOString().split('T')[0];
            const endDateStr = typeof endDate === 'string'
                ? endDate
                : endDate.toISOString().split('T')[0];

            cachedQuotes = await quoteCacheService.getCachedHistoricalQuotes(
                symbol,
                startDateStr,
                endDateStr
            );

            // If we have enough cached data (at least 80% of expected), use it
            const expectedDays = Math.floor((new Date(endDateStr).getTime() - new Date(startDateStr).getTime()) / (1000 * 60 * 60 * 24));
            if (cachedQuotes.length >= expectedDays * 0.8) {
                console.log(`Using ${cachedQuotes.length} cached quotes for ${symbol}`);
                return NextResponse.json({
                    success: true,
                    symbol,
                    source: 'cache',
                    period: {
                        start: cachedQuotes[0]?.date || startDateStr,
                        end: cachedQuotes[cachedQuotes.length - 1]?.date || endDateStr
                    },
                    interval,
                    dataPoints: cachedQuotes.length,
                    data: cachedQuotes,
                    timestamp: new Date().toISOString()
                });
            }
        }

        const result = await finnhub.getHistoricalData({
            symbol,
            period1: queryOptions.period1,
            period2: endDate,
            interval: interval as any
        });

        if (!result.success || !result.data?.quotes || result.data.quotes.length === 0) {
            const errorMessage = !result.success
                ? (result as any).error || 'Failed to fetch historical data'
                : `No historical data found for ${symbol}`;

            console.log(`Historical data API response: ${JSON.stringify({
                success: result.success,
                quotesLength: result.data?.quotes?.length || 0,
                error: (result as any).error,
                source: (result as any).source
            })}`);

            // Determine the appropriate hint based on configuration
            let hint: string | undefined;
            const hasAlpacaKey = !!(process.env.ALPACA_API_KEY || process.env.APCA_API_KEY_ID);
            const hasAlpacaSecret = !!(process.env.ALPACA_SECRET || process.env.APCA_API_SECRET_KEY);
            const hasFinnhubKey = !!process.env.FINNHUB_API_KEY;

            if (!hasAlpacaKey && !hasFinnhubKey) {
                hint = 'No API keys configured. Set FINNHUB_API_KEY and/or ALPACA_API_KEY + ALPACA_SECRET environment variables.';
            } else if (hasAlpacaKey && !hasAlpacaSecret) {
                hint = 'ALPACA_SECRET is missing. Both ALPACA_API_KEY and ALPACA_SECRET are required.';
            } else if (range === '5y' || range === '10y' || range === 'max') {
                hint = `Long date ranges (${range}) may have limited data availability. Try a shorter range like 1y or 2y.`;
            }

            return NextResponse.json(
                {
                    success: false,
                    error: errorMessage,
                    code: 'NO_DATA',
                    source: (result as any).source,
                    requestedRange: range,
                    requestedInterval: interval,
                    hint,
                    timestamp: new Date().toISOString()
                },
                { status: 404 }
            );
        }

        const quotes = result.data.quotes;
        const meta = result.data.meta;

        // Save to cache if using daily interval
        if (useCache && interval === '1d' && quotes.length > 0) {
            await quoteCacheService.saveHistoricalQuotes(symbol, quotes).catch(err => {
                console.error('Failed to cache historical quotes:', err);
            });
        }

        return NextResponse.json({
            success: true,
            symbol,
            source: (result as any).source || 'unknown',
            period: {
                start: quotes[0]?.date || period1Param || range,
                end: quotes[quotes.length - 1]?.date || period2Param || 'now'
            },
            interval,
            dataPoints: quotes.length,
            data: quotes,
            meta: {
                currency: meta?.currency,
                symbol: meta?.symbol,
                exchangeName: meta?.exchangeName,
                instrumentType: meta?.instrumentType,
                firstTradeDate: meta?.firstTradeDate,
                regularMarketTime: meta?.regularMarketTime,
                regularMarketPrice: meta?.regularMarketPrice,
                gmtoffset: meta?.gmtoffset,
                timezone: meta?.timezone,
                exchangeTimezoneName: meta?.exchangeTimezoneName
            },
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Historical data fetch error:', error);
        
        // Provide more helpful error messages
        let errorMessage = 'Failed to fetch historical data';
        let errorCode = 'HISTORICAL_ERROR';

        if (error.message?.includes('Invalid symbol')) {
            errorMessage = `Invalid symbol: ${symbol}`;
            errorCode = 'INVALID_SYMBOL';
        } else if (error.message?.includes('Not Found')) {
            errorMessage = `Symbol not found: ${symbol}`;
            errorCode = 'SYMBOL_NOT_FOUND';
        } else if (error.message) {
            errorMessage = error.message;
        }

        return NextResponse.json(
            {
                success: false,
                error: errorMessage,
                code: errorCode,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
