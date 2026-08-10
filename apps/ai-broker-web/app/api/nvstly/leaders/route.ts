import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { nvstlyLeaders, nvstlyTrades } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    // Fetch all leaders from database, ordered by rank
    const leaders = await db
      .select()
      .from(nvstlyLeaders)
      .orderBy(nvstlyLeaders.rank)

    // Fetch trades for each leader
    const leadersWithTrades = await Promise.all(
      leaders.map(async (leader) => {
        const trades = await db
          .select()
          .from(nvstlyTrades)
          .where(eq(nvstlyTrades.traderId, leader.id))
          .orderBy(nvstlyTrades.time)

        return {
          id: leader.id,
          name: leader.name,
          rank: leader.rank,
          rep: leader.rep,
          trades: leader.trades,
          winRate: leader.winRate,
          totalGain: leader.totalGain,
          avgReturn: leader.avgReturn,
          broker: leader.broker,
          orders: trades.map((trade) => ({
            symbol: trade.symbol,
            type: trade.type,
            price: trade.price,
            previousPrice: trade.previousPrice,
            gain: trade.gain,
            time: trade.time,
          })),
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: leadersWithTrades
    })
  } catch (error: any) {
    console.error('Failed to fetch NVSTLY leaders:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch leaders' },
      { status: 500 }
    )
  }
}
