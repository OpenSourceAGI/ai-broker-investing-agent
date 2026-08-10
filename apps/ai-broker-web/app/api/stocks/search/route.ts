// Stock Search API Route
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');

        if (!query) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Query parameter q is required',
                    code: 'MISSING_QUERY',
                    timestamp: new Date().toISOString()
                },
                { status: 400 }
            );
        }

        const result = await yahooFinance.search(query);

        return NextResponse.json({
            success: true,
            query,
            count: result.quotes?.length || 0,
            data: result.quotes,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Search failed',
                code: 'SEARCH_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
