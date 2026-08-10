import { NextRequest, NextResponse } from 'next/server'
import { getMarketPositions, fetchMarketOrderBook, saveMarketPositions } from '@/packages/investing/src/prediction'

export const dynamic = 'force-dynamic'

// GET /api/polymarket/positions/[marketId]?sync=true
export async function GET(
  request: NextRequest,
  { params }: { params: { marketId: string } }
) {
  try {
    const marketId = params.marketId
    const searchParams = request.nextUrl.searchParams
    const sync = searchParams.get('sync') === 'true'

    // If sync is requested, fetch fresh data from API
    if (sync) {
      const orderBook = await fetchMarketOrderBook(marketId)
      if (orderBook) {
        await saveMarketPositions(marketId, orderBook)
      }
    }

    // Fetch positions from database
    const positions = await getMarketPositions(marketId)

    // Aggregate positions by side and outcome
    const aggregated = {
      buy: {
        totalValue: 0,
        totalSize: 0,
        positions: [] as any[],
      },
      sell: {
        totalValue: 0,
        totalSize: 0,
        positions: [] as any[],
      },
    }

    for (const pos of positions) {
      if (pos.side === 'buy') {
        aggregated.buy.totalValue += pos.totalValue || 0
        aggregated.buy.totalSize += pos.size || 0
        aggregated.buy.positions.push(pos)
      } else {
        aggregated.sell.totalValue += pos.totalValue || 0
        aggregated.sell.totalSize += pos.size || 0
        aggregated.sell.positions.push(pos)
      }
    }

    return NextResponse.json({
      success: true,
      marketId,
      positions: {
        all: positions,
        aggregated,
        summary: {
          totalBuyValue: aggregated.buy.totalValue,
          totalSellValue: aggregated.sell.totalValue,
          totalBuySize: aggregated.buy.totalSize,
          totalSellSize: aggregated.sell.totalSize,
          buyCount: aggregated.buy.positions.length,
          sellCount: aggregated.sell.positions.length,
        },
      },
    })
  } catch (error) {
    console.error('Error fetching market positions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch positions'
      },
      { status: 500 }
    )
  }
}
