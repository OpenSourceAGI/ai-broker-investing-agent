// SEC Filings API Route
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'sec-edgar-toolkit';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    try {
        const { symbol } = await params;
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20');

        // Initialize toolkit client
        // Using a generic user agent for this example, but in production ideally this comes from env or config
        const client = createClient({
            userAgent: "StockPredictionAgent/1.0 (admin@example.com)"
        });

        console.log(`Fetching filings for ${symbol} using sec-edgar-toolkit...`);

        // Lookup company by symbol (works for Ticker or CIK)
        // The toolkit handles looking up the CIK automatically from the ticker
        let company;
        try {
            company = await client.companies.lookup(symbol.toUpperCase());
        } catch (lookupError: any) {
            console.error(`Lookup error for ${symbol}:`, lookupError);
            return NextResponse.json(
                {
                    success: false,
                    error: `Symbol ${symbol.toUpperCase()} not found in SEC EDGAR. This symbol may not file with the SEC or may use a different ticker.`,
                    code: 'SYMBOL_NOT_FOUND',
                    details: lookupError.message,
                    timestamp: new Date().toISOString()
                },
                { status: 404 }
            );
        }

        if (!company) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Symbol ${symbol.toUpperCase()} not found in SEC EDGAR`,
                    code: 'SYMBOL_NOT_FOUND',
                    timestamp: new Date().toISOString()
                },
                { status: 404 }
            );
        }
        
        // Fetch recent filings
        // We default to strictly 10-K, 10-Q, 8-K for relevance, unless specific requirements exist
        // The previous implementation fetched 'submission' history which contains everything.
        // Let's broaden to common useful forms.
        const filings = await company.filings
            .formTypes(['10-K', '10-Q', '8-K', '3', '4', '5']) // Include ownership forms as requested by user context feature list
            .recent(limit)
            .fetch();

        // Map toolkit result to our API response format
        // The toolkit returns Filing objects. We extract properties.
        const mappedFilings = filings.map((f: any) => ({
            accessionNumber: f.accessionNumber,
            filingDate: f.filingDate,
            reportDate: f.reportDate || null,
            acceptanceDateTime: f.acceptanceDateTime || null,
            act: f.act || null,
            form: f.form || f.type || 'Unknown',
            fileNumber: f.fileNumber || null,
            filmNumber: f.filmNumber || null,
            items: f.items || [],
            size: f.size || 0,
            isXBRL: f.isXBRL || false,
            isInlineXBRL: f.isInlineXBRL || false,
            primaryDocument: f.primaryDocument || '',
            primaryDocDescription: f.primaryDocDescription || '',
             // Construct standard EDGAR URL if not provided directly
            url: `https://www.sec.gov/Archives/edgar/data/${company.cik}/${f.accessionNumber ? f.accessionNumber.replace(/-/g, '') : ''}/${f.primaryDocument || ''}`
        }));

        return NextResponse.json({
            success: true,
            symbol: symbol.toUpperCase(),
            cik: company.cik,
            companyName: company.name,
            // Toolkit might not provide these immediately without extra calls, so we omit or null them
            // The previous manual call to 'submissions' had them. 
            // The 'company' object likely defines basic props.
            sic: (company as any).sic || null, 
            sicDescription: (company as any).sicDescription || null,
            fiscalYearEnd: (company as any).fiscalYearEnd || null,
            stateOfIncorporation: (company as any).stateOfIncorporation || null, 
            filings: mappedFilings,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('SEC Toolkit Error:', error);
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch SEC filings',
                code: 'SEC_TOOLKIT_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
