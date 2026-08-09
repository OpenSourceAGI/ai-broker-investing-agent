import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { portfolios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

/**
 * POST /api/user/portfolio/initialize
 * Initialize a new user's portfolio with play money
 */
export async function POST(request: NextRequest) {
  try {
    // Get session from Better Auth
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    // Check if portfolio already exists
    const existing = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, userId))
      .limit(1)

    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        portfolio: existing[0],
        message: 'Portfolio already initialized'
      })
    }

    // Create new portfolio with $100,000 play money
    const newPortfolio = await db
      .insert(portfolios)
      .values({
        id: `portfolio_${userId}_${Date.now()}`,
        userId: userId,
        totalEquity: 100000,
        cash: 100000,
        stocks: 0,
        predictionMarkets: 0,
        margin: 0,
        dailyPnL: 0,
        dailyPnLPercent: 0,
        winRate: 0,
        openPositions: 0,
        updatedAt: new Date(),
      })
      .returning()

    return NextResponse.json({
      success: true,
      portfolio: newPortfolio[0],
      message: 'Portfolio initialized with $100,000 play money'
    })

  } catch (error: any) {
    console.error('Portfolio initialization error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to initialize portfolio' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/user/portfolio/initialize
 * Get portfolio info
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    })

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id

    const portfolio = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, userId))
      .limit(1)

    if (portfolio.length === 0) {
      return NextResponse.json({
        success: false,
        portfolio: null,
        message: 'Portfolio not found'
      })
    }

    return NextResponse.json({
      success: true,
      portfolio: portfolio[0]
    })

  } catch (error: any) {
    console.error('Get portfolio error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch portfolio' },
      { status: 500 }
    )
  }
}
