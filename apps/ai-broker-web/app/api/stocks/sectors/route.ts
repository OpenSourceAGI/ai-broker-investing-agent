// Sector Info API Route
import { NextRequest, NextResponse } from 'next/server';
// Bundled at build time: Cloudflare Workers has no filesystem to read from at
// request time.
import sectorInfo from '@/packages/investing/src/stock-names-data/sector-info.json';

interface SectorInfo {
    sector: string;
    totalCompanies?: number;
    totalMarketCap?: number;
    industries?: unknown;
    top10Companies?: unknown;
}

const sectors = sectorInfo as SectorInfo[];

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sector = searchParams.get('sector');
        const includeCompanies = searchParams.get('includeCompanies') === 'true';
        const includeIndustries = searchParams.get('includeIndustries') === 'true';

        // If specific sector requested
        if (sector) {
            const sectorData = sectors.find(
                (s) => s.sector.toLowerCase() === sector.toLowerCase()
            );

            if (!sectorData) {
                return NextResponse.json(
                    {
                        success: false,
                        error: `Sector '${sector}' not found`,
                        code: 'SECTOR_NOT_FOUND',
                        availableSectors: sectors.map((s) => s.sector),
                        timestamp: new Date().toISOString()
                    },
                    { status: 404 }
                );
            }

            // Filter data based on query params
            const filteredData: SectorInfo = { ...sectorData };
            if (!includeCompanies) {
                delete filteredData.top10Companies;
            }
            if (!includeIndustries) {
                delete filteredData.industries;
            }

            return NextResponse.json({
                success: true,
                data: filteredData,
                timestamp: new Date().toISOString()
            });
        }

        // Return all sectors with basic info
        const sectorSummary = sectors.map((s) => ({
            sector: s.sector,
            totalCompanies: s.totalCompanies,
            totalMarketCap: s.totalMarketCap,
            ...(includeIndustries && { industries: s.industries }),
            ...(includeCompanies && { top10Companies: s.top10Companies })
        }));

        return NextResponse.json({
            success: true,
            count: sectorSummary.length,
            data: sectorSummary,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Failed to fetch sector info',
                code: 'SECTOR_INFO_ERROR',
                timestamp: new Date().toISOString()
            },
            { status: 500 }
        );
    }
}
