import { NextRequest, NextResponse } from 'next/server'
import { getZuluTraderById, fetchZuluTraderDetail, saveZuluTraders } from '@/packages/investing/src/leaders/zulu'

export async function GET(
  request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
  try {
        const { id } = await params;
        const providerId = parseInt(id)
    const { searchParams } = new URL(request.url)
    const refresh = searchParams.get('refresh') === 'true'
    
    if (!refresh) {
      const cached = await getZuluTraderById(providerId)
      if (cached && cached.updatedAt && Date.now() - cached.updatedAt.getTime() < 3600000) {
        return NextResponse.json(cached)
      }
    }
    
    const detail = await fetchZuluTraderDetail(providerId)
    
    if (detail.trader?.stats) {
      await saveZuluTraders([{ trader: detail.trader.stats }])
    }
    
    return NextResponse.json(detail)
  } catch (error: any) {
    console.error('Error fetching Zulu trader detail:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch trader detail' },
      { status: 500 }
    )
  }
}
