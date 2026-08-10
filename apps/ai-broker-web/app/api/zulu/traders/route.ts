import { NextRequest, NextResponse } from 'next/server'
import { getZuluTraders } from '@/packages/investing/src/leaders/zulu'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    
    const traders = await getZuluTraders(limit)
    return NextResponse.json(traders)
  } catch (error: any) {
    console.error('Error fetching Zulu traders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch traders' },
      { status: 500 }
    )
  }
}
