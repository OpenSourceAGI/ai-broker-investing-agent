import { NextRequest, NextResponse } from 'next/server'
import { searchZuluTraders } from '@/packages/investing/src/leaders/zulu'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    
    const filters = {
      minRoi: searchParams.get('minRoi') ? parseFloat(searchParams.get('minRoi')!) : undefined,
      minWinRate: searchParams.get('minWinRate') ? parseFloat(searchParams.get('minWinRate')!) : undefined,
      maxDrawdown: searchParams.get('maxDrawdown') ? parseFloat(searchParams.get('maxDrawdown')!) : undefined,
      isEa: searchParams.get('isEa') === 'true' ? true : searchParams.get('isEa') === 'false' ? false : undefined,
      limit: parseInt(searchParams.get('limit') || '50'),
    }
    
    const traders = await searchZuluTraders(filters)
    return NextResponse.json(traders)
  } catch (error: any) {
    console.error('Error searching Zulu traders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search traders' },
      { status: 500 }
    )
  }
}
