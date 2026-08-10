import { NextResponse } from 'next/server'
import { syncZuluTraders } from '@/packages/investing/src/leaders/zulu'
import { syncLeadersAndCategories } from '@/packages/investing/src/prediction'

export async function POST() {
  try {
    const [zuluResult, polyResult] = await Promise.all([
      syncZuluTraders(),
      syncLeadersAndCategories()
    ])

    return NextResponse.json({
      success: true,
      message: 'Sync completed successfully',
      results: {
        zulu: zuluResult,
        polymarket: polyResult
      }
    })
  } catch (error: any) {
    console.error('Leaderboard sync failed:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
