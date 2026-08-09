import { NextResponse } from 'next/server'
import { syncZuluTraders } from '@/packages/investing/src/leaders/zulu'

export async function POST() {
  try {
    const result = await syncZuluTraders()
    
    return NextResponse.json({
      success: true,
      data: result,
      message: `Successfully synced ${result.traders} traders`
    })
  } catch (error: any) {
    console.error('Error syncing Zulu traders:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to sync traders' 
      },
      { status: 500 }
    )
  }
}
