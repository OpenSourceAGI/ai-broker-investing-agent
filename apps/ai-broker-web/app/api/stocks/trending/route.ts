// Trending Stocks API Route
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const region = searchParams.get('region') || 'US';

        const result = await yahooFinance.trendingSymbols(region);

        return NextResponse.json({
            success: true,
            region,
            count: result.quotes?.length || 0,
            data: result.quotes,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch trending symbols',
                code: 'TRENDING_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
