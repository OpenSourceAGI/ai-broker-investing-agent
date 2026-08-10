import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/packages/investing/src/stocks/yahoo-finance-wrapper'
import { backtest, STRATEGY_INFOS, StrategyInfo } from 'indicatorts'
interface BacktestRequest {
  symbol: string
  startDate: string
  endDate: string
  initialCapital?: number
  strategyIds?: string[]
}

interface TradeSignal {
  date: string
  time: number
  action: 'BUY' | 'SELL'
  price: number
}

interface BacktestResult {
  success: boolean
  symbol: string
  startDate: string
  endDate: string
  initialCapital: number
  results: {
    strategyName: string
    strategyId: string
    finalValue: number
    totalReturn: number
    totalReturnPercent: number
    totalTrades: number
    winningTrades: number
    losingTrades: number
    winRate: number
    sharpeRatio?: number
    maxDrawdown: number
    signals: TradeSignal[]
  }[]
}

// Map strategy IDs to their names
const STRATEGY_ID_MAP: Record<string, string> = {
  'buy-hold': 'Buy Hold',
  'awesome-oscillator': 'Awesome Oscillator',
  'rsi-2': 'RSI 2',
  'ichimoku-cloud': 'Ichimoku Cloud',
  'stochastic-oscillator': 'Stochastic Oscillator',
  'williams-r': 'Williams R',
  'apo': 'Absolute Price Oscillator (APO)',
  'aroon': 'Aroon Strategy',
  'bop': 'Balance of Power (BOM)',
  'cfo': 'Chande Forecast Oscillator (CFO)',
  'kdj': 'KDJ Strategy',
  'macd': 'MACD Strategy',
  'psar': 'Parabolic SAR',
  'typical-price': 'Typical Price',
  'vortex': 'Vortex Strategy',
  'acceleration-bands': 'Acceleration Bands',
  'bollinger-bands': 'Bollinger Bands',
  'projection-oscillator': 'Projection Oscillator',
  'cmf': 'Chaikin Money Flow (CMF)',
  'emv': 'Ease of Movement (EMV)',
  'force-index': 'Force Index',
  'mfi': 'Money Flow Index',
  'nvi': 'Negative Volume Index (NVI)',
  'vwap': 'Volume Weighted Average Price',
}

function calculateMetrics(actions: number[], closingPrices: number[], dates: Date[], initialCapital: number) {
  let cash = initialCapital
  let shares = 0
  let trades = 0
  let winningTrades = 0
  let losingTrades = 0
  let maxValue = initialCapital
  let minValue = initialCapital
  const returns: number[] = []
  const signals: TradeSignal[] = []
  let lastBuyPrice = 0

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const price = closingPrices[i]
    const date = dates[i]

    if (action === 1 && shares === 0) {
      // Buy signal
      shares = Math.floor(cash / price)
      if (shares > 0) {
        cash -= shares * price
        lastBuyPrice = price
        signals.push({
          date: date.toISOString(),
          time: Math.floor(date.getTime() / 1000),
          action: 'BUY',
          price: price
        })
      }
    } else if (action === -1 && shares > 0) {
      // Sell signal
      const revenue = shares * price
      cash += revenue
      trades++

      if (price > lastBuyPrice) {
        winningTrades++
      } else if (price < lastBuyPrice) {
        losingTrades++
      }

      signals.push({
        date: date.toISOString(),
        time: Math.floor(date.getTime() / 1000),
        action: 'SELL',
        price: price
      })

      shares = 0
    }

    const currentValue = cash + shares * price
    maxValue = Math.max(maxValue, currentValue)
    minValue = Math.min(minValue, currentValue)

    if (i > 0) {
      const dailyReturn = (currentValue - (cash + shares * closingPrices[i - 1])) / (cash + shares * closingPrices[i - 1])
      returns.push(dailyReturn)
    }
  }

  // Close any open positions
  if (shares > 0) {
    const lastPrice = closingPrices[closingPrices.length - 1]
    const lastDate = dates[dates.length - 1]
    cash += shares * lastPrice
    trades++
    if (lastPrice > lastBuyPrice) {
      winningTrades++
    } else if (lastPrice < lastBuyPrice) {
      losingTrades++
    }
    signals.push({
      date: lastDate.toISOString(),
      time: Math.floor(lastDate.getTime() / 1000),
      action: 'SELL',
      price: lastPrice
    })
    shares = 0
  }

  const finalValue = cash
  const totalReturn = finalValue - initialCapital
  const totalReturnPercent = (totalReturn / initialCapital) * 100
  const winRate = trades > 0 ? (winningTrades / trades) * 100 : 0
  const maxDrawdown = maxValue > 0 ? ((maxValue - minValue) / maxValue) * 100 : 0

  // Calculate Sharpe Ratio (simplified)
  let sharpeRatio: number | undefined
  if (returns.length > 0) {
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    const stdDev = Math.sqrt(variance)
    sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : undefined // Annualized
  }

  return {
    finalValue,
    totalReturn,
    totalReturnPercent,
    totalTrades: trades,
    winningTrades,
    losingTrades,
    winRate,
    sharpeRatio,
    maxDrawdown,
    signals,
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: BacktestRequest = await request.json()
    const {
      symbol,
      startDate,
      endDate,
      initialCapital = 100000,
      strategyIds = []
    } = body

    if (!symbol || !startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters: symbol, startDate, endDate' },
        { status: 400 }
      )
    }

    console.log(`[Backtest] Request: ${symbol}, ${startDate} to ${endDate}, strategies: ${strategyIds.length > 0 ? strategyIds.join(', ') : 'ALL'}`)

    // Fetch historical data
    const historicalData = await yahooFinance.getHistorical(symbol, {
      period1: new Date(startDate),
      period2: new Date(endDate),
      interval: '1d'
    })

    if (!historicalData.success || !historicalData.data) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch historical data for ' + symbol },
        { status: 500 }
      )
    }

    // Handle both nested (Alpaca/Finnhub) and flat array formats
    const prices = Array.isArray(historicalData.data)
      ? historicalData.data
      : historicalData.data.quotes || []

    if (prices.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No historical data available for ' + symbol },
        { status: 500 }
      )
    }

    // Convert to Asset format for indicatorts
    const asset = {
      dates: prices.map((p: any) => new Date(p.date)),
      openings: prices.map((p: any) => p.open),
      closings: prices.map((p: any) => p.close),
      highs: prices.map((p: any) => p.high),
      lows: prices.map((p: any) => p.low),
      volumes: prices.map((p: any) => p.volume),
    }

    // Filter strategies if specific IDs are provided
    let strategiesToTest: StrategyInfo[] = STRATEGY_INFOS
    if (strategyIds.length > 0) {
      const selectedNames = strategyIds.map(id => STRATEGY_ID_MAP[id]).filter(Boolean)
      strategiesToTest = STRATEGY_INFOS.filter(info => selectedNames.includes(info.name))
    }

    // Run backtest
    const backtestResults = backtest(asset, strategiesToTest)

    // Calculate metrics for each strategy
    const results = backtestResults.map((result) => {
      const strategyInfo = result.info

      // Run strategy to get actions
      const actions = strategyInfo.strategy(asset)
      const metrics = calculateMetrics(actions, asset.closings, asset.dates, initialCapital)

      // Find strategy ID
      const strategyId = Object.entries(STRATEGY_ID_MAP).find(
        ([_, name]) => name === strategyInfo.name
      )?.[0] || strategyInfo.name.toLowerCase().replace(/\s+/g, '-')

      return {
        strategyName: strategyInfo.name,
        strategyId,
        ...metrics,
      }
    })

    // Sort by total return
    results.sort((a, b) => b.totalReturnPercent - a.totalReturnPercent)

    const response: BacktestResult = {
      success: true,
      symbol,
      startDate,
      endDate,
      initialCapital,
      results,
    }

    console.log(`[Backtest] ${symbol}: Tested ${results.length} strategies, returning results`)

    return NextResponse.json(response)

  } catch (error: any) {
    console.error('Technical backtest error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Technical backtest failed' },
      { status: 500 }
    )
  }
}
