import { NextRequest, NextResponse } from 'next/server'
import { getCategories } from '@/packages/investing/src/prediction'

export async function GET(request: NextRequest) {
  try {
    const categories = await getCategories()
    return NextResponse.json(categories)
  } catch (error: any) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}
