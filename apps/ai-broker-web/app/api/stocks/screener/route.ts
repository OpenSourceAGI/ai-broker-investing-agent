// Stock Screener API Route
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const scrIds = searchParams.get('scrIds');

        if (!scrIds) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'scrIds parameter is required',
                    code: 'MISSING_SCRIDS',
                    timestamp: new Date().toISOString()
                },
                { status: 400 }
            );
        }

        const result = await yahooFinance.screener({ scrIds: scrIds as any });

        return NextResponse.json({
            success: true,
            count: result.quotes?.length || 0,
            data: result.quotes,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Screener failed',
                code: 'SCREENER_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
