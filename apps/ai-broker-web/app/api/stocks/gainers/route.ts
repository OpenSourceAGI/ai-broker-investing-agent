// Daily Gainers API Route
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const count = parseInt(searchParams.get('count') || '25');

        const result = await yahooFinance.screener({ scrIds: 'day_gainers', count });

        return NextResponse.json({
            success: true,
            count:result.quotes?.length || 0,
            data: result.quotes,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch daily gainers',
                code: 'GAINERS_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
