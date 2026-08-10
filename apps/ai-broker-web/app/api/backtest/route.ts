import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/packages/investing/src/stocks/yahoo-finance-wrapper'

interface BacktestRequest {
  symbol: string
  startDate: string
  endDate: string
  initialCapital?: number
  strategy?: 'buy-and-hold' | 'momentum' | 'mean-reversion'
}

interface Trade {
  date: string
  action: 'BUY' | 'SELL'
  price: number
  shares: number
  value: number
}

interface BacktestResult {
  success: boolean
  symbol: string
  initialCapital: number
  finalValue: number
  totalReturn: number
  totalReturnPercent: number
  trades: Trade[]
  metrics: {
    sharpeRatio?: number
    maxDrawdown: number
    winRate: number
    totalTrades: number
  }
}

// Simple momentum strategy: buy when price crosses above 20-day MA, sell when crosses below
function calculateMomentumSignals(prices: any[]) {
  const signals: { date: string; signal: 'BUY' | 'SELL' | 'HOLD' }[] = []
  const maWindow = 20
  
  for (let i = maWindow; i < prices.length; i++) {
    const ma = prices.slice(i - maWindow, i).reduce((sum: number, p: any) => sum + p.close, 0) / maWindow
    const prevMa = prices.slice(i - maWindow - 1, i - 1).reduce((sum: number, p: any) => sum + p.close, 0) / maWindow
    
    if (prices[i].close > ma && prices[i - 1].close <= prevMa) {
      signals.push({ date: new Date(prices[i].date).toISOString(), signal: 'BUY' })
    } else if (prices[i].close < ma && prices[i - 1].close >= prevMa) {
      signals.push({ date: new Date(prices[i].date).toISOString(), signal: 'SELL' })
    } else {
      signals.push({ date: new Date(prices[i].date).toISOString(), signal: 'HOLD' })
    }
  }
  
  return signals
}

export async function POST(request: NextRequest) {
  try {
    const body: BacktestRequest = await request.json()
    const { symbol, startDate, endDate, initialCapital = 100000, strategy = 'buy-and-hold' } = body
    
    if (!symbol || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      )
    }
    
    // Fetch historical data
    const historicalData = await yahooFinance.getHistorical(symbol, {
      period1: new Date(startDate),
      period2: new Date(endDate),
      interval: '1d'
    })
    
    if (!historicalData.success || !historicalData.data) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch historical data' },
        { status: 500 }
      )
    }

    // Handle both nested (Alpaca/Finnhub) and flat array formats
    const prices = Array.isArray(historicalData.data)
      ? historicalData.data
      : historicalData.data.quotes || []

    if (prices.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No historical data available' },
        { status: 500 }
      )
    }
    let cash = initialCapital
    let shares = 0
    const trades: Trade[] = []
    let maxValue = initialCapital
    let minValue = initialCapital
    
    if (strategy === 'buy-and-hold') {
      // Buy at start, sell at end
      const buyPrice = prices[0].close
      const sellPrice = prices[prices.length - 1].close
      shares = Math.floor(initialCapital / buyPrice)
      cash = initialCapital - (shares * buyPrice)
      
      trades.push({
        date: new Date(prices[0].date).toISOString(),
        action: 'BUY',
        price: buyPrice,
        shares,
        value: shares * buyPrice
      })
      
      const finalValue = cash + (shares * sellPrice)
      
      trades.push({
        date: new Date(prices[prices.length - 1].date).toISOString(),
        action: 'SELL',
        price: sellPrice,
        shares,
        value: shares * sellPrice
      })
      
      const result: BacktestResult = {
        success: true,
        symbol,
        initialCapital,
        finalValue,
        totalReturn: finalValue - initialCapital,
        totalReturnPercent: ((finalValue - initialCapital) / initialCapital) * 100,
        trades,
        metrics: {
          maxDrawdown: ((maxValue - minValue) / maxValue) * 100,
          winRate: finalValue > initialCapital ? 100 : 0,
          totalTrades: 2
        }
      }
      
      return NextResponse.json(result)
      
    } else if (strategy === 'momentum') {
      // Momentum strategy using moving average crossover
      const signals = calculateMomentumSignals(prices)
      
      for (let i = 0; i < signals.length; i++) {
        const signal = signals[i]
        const price = prices[i + 20] // offset by MA window
        
        if (signal.signal === 'BUY' && shares === 0 && price.close) {
          shares = Math.floor(cash / price.close)
          if (shares > 0) {
            const cost = shares * price.close
            cash -= cost
            
            trades.push({
              date: signal.date,
              action: 'BUY',
              price: price.close,
              shares,
              value: cost
            })
          }
        } else if (signal.signal === 'SELL' && shares > 0 && price.close) {
          const revenue = shares * price.close
          cash += revenue
          
          trades.push({
            date: signal.date,
            action: 'SELL',
            price: price.close,
            shares,
            value: revenue
          })
          
          shares = 0
        }
        
        const currentValue = cash + (shares * (price.close || 0))
        maxValue = Math.max(maxValue, currentValue)
        minValue = Math.min(minValue, currentValue)
      }
      
      // Close any open positions
      if (shares > 0) {
        const lastPrice = prices[prices.length - 1].close
        cash += shares * lastPrice
        trades.push({
          date: new Date(prices[prices.length - 1].date).toISOString(),
          action: 'SELL',
          price: lastPrice,
          shares,
          value: shares * lastPrice
        })
        shares = 0
      }
      
      const finalValue = cash + (shares * prices[prices.length - 1].close)
      const winningTrades = trades.filter((t, i) => {
        if (t.action === 'SELL' && i > 0) {
          const buyTrade = trades[i - 1]
          return t.price > buyTrade.price
        }
        return false
      }).length
      
      const result: BacktestResult = {
        success: true,
        symbol,
        initialCapital,
        finalValue,
        totalReturn: finalValue - initialCapital,
        totalReturnPercent: ((finalValue - initialCapital) / initialCapital) * 100,
        trades,
        metrics: {
          maxDrawdown: ((maxValue - minValue) / maxValue) * 100,
          winRate: trades.length > 1 ? (winningTrades / (trades.length / 2)) * 100 : 0,
          totalTrades: trades.length
        }
      }
      
      return NextResponse.json(result)
    }
    
    return NextResponse.json(
      { success: false, error: 'Invalid strategy' },
      { status: 400 }
    )
    
  } catch (error: any) {
    console.error('Backtest error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Backtest failed' },
      { status: 500 }
    )
  }
}
