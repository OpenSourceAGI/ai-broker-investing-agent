// Sector Info API Route
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SECTOR_INFO_FILE = path.join(process.cwd(), 'data/sector-info.json');

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sector = searchParams.get('sector');
        const includeCompanies = searchParams.get('includeCompanies') === 'true';
        const includeIndustries = searchParams.get('includeIndustries') === 'true';

        // Check if file exists
        if (!fs.existsSync(SECTOR_INFO_FILE)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Sector info data not found. Run import:stocks to generate.',
                    code: 'FILE_NOT_FOUND',
                    timestamp: new Date().toISOString()
                },
                { status: 404 }
            );
        }

        // Read sector info data
        const fileContent = fs.readFileSync(SECTOR_INFO_FILE, 'utf-8');
        const sectors = JSON.parse(fileContent);

        // If specific sector requested
        if (sector) {
            const sectorData = sectors.find((s: any) => 
                s.sector.toLowerCase() === sector.toLowerCase()
            );

            if (!sectorData) {
                return NextResponse.json(
                    {
                        success: false,
                        error: `Sector '${sector}' not found`,
                        code: 'SECTOR_NOT_FOUND',
                        availableSectors: sectors.map((s: any) => s.sector),
                        timestamp: new Date().toISOString()
                    },
                    { status: 404 }
                );
            }

            // Filter data based on query params
            const filteredData = { ...sectorData };
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
        const sectorSummary = sectors.map((s: any) => ({
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
