import { NextRequest, NextResponse } from 'next/server'
import { getTraderPositions } from '@/packages/investing/src/prediction'

export async function POST(request: NextRequest) {
  try {
    const { trader_id } = await request.json()
    
    if (!trader_id) {
      return NextResponse.json(
        { error: 'trader_id required' },
        { status: 400 }
      )
    }
    
    const positions = await getTraderPositions(trader_id)
    return NextResponse.json(positions)
  } catch (error: any) {
    console.error('Error fetching trader positions:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
