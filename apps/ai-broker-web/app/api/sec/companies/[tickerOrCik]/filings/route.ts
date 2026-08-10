// Company Filings API Route
import { NextRequest, NextResponse } from 'next/server';
import { Downloader } from '@/packages/investing/src/stocks/sec-filing-api';

const downloader = new Downloader('Investment Prediction Agent', 'api@example.com');

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ tickerOrCik: string }> }
) {
    try {
        const { tickerOrCik } = await params;
        const { searchParams } = new URL(request.url);

        const formType = searchParams.get('formType');
        const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10;

        if (!formType) {
             // Default to 10-K if not specified
             // return NextResponse.json(
             //     {
             //         success: false,
             //         error: 'formType parameter is required',
             //         code: 'MISSING_FORM_TYPE',
             //         timestamp: new Date().toISOString()
             //     },
             //     { status: 400 }
             // );
        }
        
        const typeToFetch = formType || '10-K';
        const query = `${tickerOrCik}/${typeToFetch}/${limit}`;
        const metadatas = await downloader.getFilingMetadatas(query);

        return NextResponse.json({
            success: true,
            tickerOrCik,
            formType,
            count: metadatas.length,
            data: metadatas,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch company filings',
                code: 'COMPANY_FILINGS_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
