import { NextResponse } from 'next/server'

// Paper trading portfolio with $100k starting balance
const STARTING_BALANCE = 100000

export async function GET() {
  try {
    // Return mock portfolio data for paper trading
    const portfolioData = {
      portfolio: {
        totalEquity: STARTING_BALANCE,
        cash: STARTING_BALANCE,
        stocks: 0,
        predictionMarkets: 0,
        dailyPnL: 0,
        dailyPnLPercent: 0,
        winRate: 0,
        openPositions: 0,
      },
      positions: [],
      recentTrades: []
    }

    return NextResponse.json(portfolioData)
  } catch (error) {
    console.error('Error fetching portfolio:', error)
    return NextResponse.json(
      { error: 'Failed to fetch portfolio' },
      { status: 500 }
    )
  }
}
