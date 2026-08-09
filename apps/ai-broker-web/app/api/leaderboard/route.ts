import { NextRequest, NextResponse } from 'next/server'
import { getZuluTraders } from '@/packages/investing/src/leaders/zulu'
import { getLeaders, syncLeaderboard } from '@/packages/investing/src/prediction'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const source = searchParams.get('source') || 'zulu'
  const limit = parseInt(searchParams.get('limit') || '50')
  const orderBy = searchParams.get('orderBy') as 'vol' | 'pnl' | 'overallGain' || 'vol'
  const sync = searchParams.get('sync') === 'true'

  try {
    let data: any[] = []

    if (source === 'zulu') {
      const zuluTraders = await getZuluTraders(limit)
      data = zuluTraders.map((t, index) => ({
        id: t.providerId.toString(),
        rank: index + 1,
        name: t.name,
        overallPnL: t.roiProfit || 0,
        winRate: typeof t.winRate === 'number' ? t.winRate : parseFloat(t.winRate || '0'),
        activePositions: 0, // Not directly available in summary
        currentValue: t.balance || 0,
        avgHoldingPeriod: t.avgTradeSeconds ? `${Math.round(t.avgTradeSeconds / 3600)}h` : 'N/A',
        markets: ['Forex', 'Indices'], // Placeholder/Generic
        maxDrawdown: `${t.maxDrawdownPercent}%`,
        volatility: 'Medium', // Placeholder
        type: t.isEa ? 'bot' : 'expert'
      }))
    } else if (source === 'polymarket') {
      // Sync if requested
      if (sync) {
        await syncLeaderboard({ limit, orderBy: orderBy === 'pnl' ? 'PNL' : 'VOL' })
      }

      const polyLeaders = await getLeaders(orderBy, limit)
      data = polyLeaders.map((t) => ({
        id: t.trader,
        rank: t.rank || 0,
        name: t.userName || (t.trader ? t.trader.substring(0, 8) + '...' : 'Anonymous'),
        userName: t.userName,
        xUsername: t.xUsername,
        verifiedBadge: t.verifiedBadge,
        profileImage: t.profileImage,
        overallPnL: t.pnl || t.overallGain || 0,
        volume: t.vol || 0,
        winRate: (t.winRate || 0) * 100,
        activePositions: t.activePositions || 0,
        currentValue: t.currentValue || 0,
        avgHoldingPeriod: 'N/A',
        markets: ['Prediction'],
        maxDrawdown: 'N/A',
        volatility: 'High',
        type: 'whale',
        proxyWallet: t.trader
      }))
    }

    return NextResponse.json({
      success: true,
      data,
      count: data.length
    })
  } catch (error: any) {
    console.error('Leaderboard fetch failed:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
