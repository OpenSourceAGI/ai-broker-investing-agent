// Delisted Stocks API Route
import { NextRequest, NextResponse } from 'next/server';

const EODHD_API_KEY = process.env.EODHD_API_KEY;
const EODHD_BASE_URL = 'https://eodhd.com/api';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50');
        const symbol = searchParams.get('symbol');
        const exchange = searchParams.get('exchange') || 'US';

        if (!EODHD_API_KEY) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'EODHD_API_KEY is not configured. Add it to your .env file.',
                    code: 'MISSING_API_KEY',
                    timestamp: new Date().toISOString()
                },
                { status: 500 }
            );
        }

        // If specific symbol requested, check its status
        if (symbol) {
            const url = `${EODHD_BASE_URL}/fundamentals/${symbol}.${exchange}?api_token=${EODHD_API_KEY}&filter=General`;
            
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`EODHD API returned ${response.status}`);
                }
                
                const data = await response.json();
                const isDelisted = data.General?.IsDelisted === 'true' || data.General?.IsDelisted === true;
                
                return NextResponse.json({
                    success: true,
                    delisted: isDelisted,
                    symbol: symbol,
                    exchange: exchange,
                    data: {
                        name: data.General?.Name,
                        code: data.General?.Code,
                        type: data.General?.Type,
                        exchangeName: data.General?.Exchange,
                        currencyCode: data.General?.CurrencyCode,
                        isDelisted: isDelisted,
                        isin: data.General?.ISIN,
                        description: data.General?.Description,
                    },
                    timestamp: new Date().toISOString()
                });
            } catch (error: any) {
                return NextResponse.json(
                    {
                        success: false,
                        error: `Failed to fetch data for ${symbol}: ${error.message}`,
                        code: 'SYMBOL_FETCH_ERROR',
                        timestamp: new Date().toISOString()
                    },
                    { status: 500 }
                );
            }
        }

        // Fetch delisted stocks from exchange
        const url = `${EODHD_BASE_URL}/exchange-symbol-list/${exchange}?api_token=${EODHD_API_KEY}&delisted=1`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`EODHD API returned ${response.status}`);
        }
        
        const data = await response.json();
        
        // Filter and limit results
        const delisted = (Array.isArray(data) ? data : [])
            .filter((stock: any) => stock.Code && stock.Name)
            .slice(0, limit)
            .map((stock: any) => ({
                symbol: stock.Code,
                name: stock.Name,
                type: stock.Type,
                exchange: stock.Exchange,
                currency: stock.Currency,
                country: stock.Country,
            }));

        return NextResponse.json({
            success: true,
            exchange: exchange,
            count: delisted.length,
            limit: limit,
            data: delisted,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch delisted stocks',
                code: 'DELISTED_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
