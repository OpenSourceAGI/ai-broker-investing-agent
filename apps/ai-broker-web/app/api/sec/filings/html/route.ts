// SEC Filing HTML API Route
import { NextRequest, NextResponse } from 'next/server';
import { Downloader } from '@/packages/investing/src/stocks/sec-filing-api';

const downloader = new Downloader('Investment Prediction Agent', 'api@example.com');

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const ticker = searchParams.get('ticker');
        const form = searchParams.get('form');
        const query = searchParams.get('query');

        let finalQuery = query;
        if (ticker && form) {
            finalQuery = `${ticker}/${form}`;
        }

        if (!finalQuery) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Either query or ticker and form parameters are required',
                    code: 'MISSING_PARAMS',
                    timestamp: new Date().toISOString()
                },
                { status: 400 }
            );
        }

        const html = await downloader.getFilingHtml({ query: finalQuery });

        return new NextResponse(html, {
            headers: {
                'Content-Type': 'text/html'
            }
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch filing HTML',
                code: 'HTML_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
