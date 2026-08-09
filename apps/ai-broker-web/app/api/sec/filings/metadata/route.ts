// SEC Filing Metadata API Route
import { NextRequest, NextResponse } from 'next/server';
import { Downloader } from '@/packages/investing/src/stocks/sec-filing-api';

const downloader = new Downloader('Investment Prediction Agent', 'api@example.com');

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('query');
        const includeAmends = searchParams.get('includeAmends') === 'true';

        if (!query) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Query parameter is required',
                    code: 'MISSING_QUERY',
                    timestamp: new Date().toISOString()
                },
                { status: 400 }
            );
        }

        const metadatas = await downloader.getFilingMetadatas(query, { includeAmends });

        return NextResponse.json({
            success: true,
            count: metadatas.length,
            data: metadatas,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch filing metadata',
                code: 'METADATA_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
