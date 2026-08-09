import { NextRequest, NextResponse } from 'next/server'
import { searchPublic } from '@/packages/investing/src/prediction'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Required parameter
    const query = searchParams.get('q')
    if (!query) {
      return NextResponse.json(
        {
          success: false,
          error: 'Query parameter "q" is required',
          timestamp: new Date().toISOString()
        },
        { status: 400 }
      )
    }

    // Optional parameters
    const cache = searchParams.get('cache') === 'true'
    const events_status = searchParams.get('events_status') || undefined
    const limit_per_type = searchParams.get('limit_per_type') ? parseInt(searchParams.get('limit_per_type')!) : undefined
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : undefined
    const events_tag = searchParams.getAll('events_tag')
    const keep_closed_markets = searchParams.get('keep_closed_markets') ? parseInt(searchParams.get('keep_closed_markets')!) : undefined
    const sort = searchParams.get('sort') || undefined
    const ascending = searchParams.get('ascending') === 'true'
    const search_tags = searchParams.get('search_tags') === 'true'
    const search_profiles = searchParams.get('search_profiles') === 'true'
    const recurrence = searchParams.get('recurrence') || undefined
    const exclude_tag_id = searchParams.getAll('exclude_tag_id').map(id => parseInt(id))
    const optimized = searchParams.get('optimized') === 'true'

    // Call the search function
    const result = await searchPublic({
      q: query,
      cache,
      events_status,
      limit_per_type,
      page,
      events_tag: events_tag.length > 0 ? events_tag : undefined,
      keep_closed_markets,
      sort,
      ascending,
      search_tags,
      search_profiles,
      recurrence,
      exclude_tag_id: exclude_tag_id.length > 0 ? exclude_tag_id : undefined,
      optimized
    })

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Polymarket search API error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to perform search',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
