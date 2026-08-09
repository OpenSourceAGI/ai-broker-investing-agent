// SEC Filing Download API Route
import { NextRequest, NextResponse } from 'next/server';
import { Downloader } from '@/packages/investing/src/stocks/sec-filing-api';

const downloader = new Downloader('Investment Prediction Agent', 'api@example.com');

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const url = searchParams.get('url');

        if (!url) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'URL parameter is required',
                    code: 'MISSING_URL',
                    timestamp: new Date().toISOString()
                },
                { status: 400 }
            );
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid URL format',
                    code: 'INVALID_URL',
                    timestamp: new Date().toISOString()
                },
                { status: 400 }
            );
        }

        const content = await downloader.downloadFiling({ url });
        const contentType = url.endsWith('.xml') ? 'application/xml' : 'text/html';

        return new NextResponse(content, {
            headers: {
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${url.split('/').pop()}"`
            }
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to download filing',
                code: 'DOWNLOAD_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
