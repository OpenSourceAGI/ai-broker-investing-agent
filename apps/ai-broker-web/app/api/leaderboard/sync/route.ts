import { NextResponse } from 'next/server'
import { syncZuluTraders } from '@/packages/investing/src/leaders/zulu'
import { syncLeaderboard, syncLeadersAndCategories } from '@/packages/investing/src/prediction'

export async function POST() {
  try {
    // Each source syncs independently: one upstream being down (ZuluTrade
    // and polymarketanalytics.com both rate-limit) must not throw away the
    // other's fresh leaders or fail the whole request. The official data-api
    // leaderboard is the only source that writes `vol`, the column /leaders sorts by.
    const sources = {
      zulu: syncZuluTraders(),
      polymarket: syncLeadersAndCategories(),
      polymarketLeaderboard: syncLeaderboard({ limit: 100 })
    }
    const settled = await Promise.allSettled(Object.values(sources))
    const outcome = (r: PromiseSettledResult<unknown>) =>
      r.status === 'fulfilled'
        ? r.value
        : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
    const failed = settled.filter((r) => r.status === 'rejected').length
    const allFailed = failed === settled.length

    return NextResponse.json(
      {
        success: !allFailed,
        message: failed === 0 ? 'Sync completed successfully' : `Sync completed with ${failed} failed source(s)`,
        results: Object.fromEntries(Object.keys(sources).map((name, i) => [name, outcome(settled[i])]))
      },
      { status: allFailed ? 502 : 200 }
    )
  } catch (error: any) {
    console.error('Leaderboard sync failed:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
