import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/packages/investing/src/stocks/yahoo-finance-wrapper'
import { STRATEGY_INFOS, type StrategyInfo } from 'indicatorts'
import {
  BACKTESTABLE_STRATEGY_IDS,
  TECHNICAL_STRATEGY_ID_BY_NAME,
  TECHNICAL_STRATEGY_NAME_BY_ID,
} from '@/lib/technical-strategies'
import { maxDrawdownPercent, sharpeRatioFromEquityCurve } from '@/lib/backtest-metrics'
import { validateBacktestRequest } from '@/lib/backtest-request'
import { CUSTOM_BACKTEST_STRATEGIES, type BacktestAsset } from '@/lib/custom-backtest-strategies'
import {
  computeForecasterTrustScore,
  type TrustScoreReason,
} from '@/packages/investing/src/prediction/analysis/trust-score'
import { registeredSources, type RegisteredSource } from '@/packages/investing/src/strategy-signals/registry'
import { replayDailyActions } from '@/packages/investing/src/strategy-signals/replay'

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
  feeBps?: number
  slippageBps?: number
  positionSizePercent?: number
  demoMode?: boolean
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
    trustScore: number | null
    trustReliable: boolean
    trustReason: TrustScoreReason
    signals: TradeSignal[]
  }[]
  /** Selected ids that could not be backtested here, with the reason. */
  skipped?: { strategyId: string; reason: string }[]
}

/** Trust is unreliable below this many closed trades (the paper's N >= 25). */
const TRUST_MIN_TRADES = 25

const registeredById = new Map(registeredSources.map((entry) => [entry.source.id, entry]))

function getUnsupportedReason(id: string, entry?: RegisteredSource): string {
  if (entry?.source.id === 'red-flags') {
    return 'replay demo only: advisory only (debate red-flag filter vetoes risky ideas during multi-agent debate but does not generate directional trading signals for daily equity bars).'
  }
  if (entry?.venue && entry.venue !== 'equity') {
    return `replay demo only: unsupported asset type (strategy targets ${entry.venue} binary contracts, not equity OHLCV). Run \`bun run demo:strategy-signals\` in packages/investing.`
  }
  if (entry) {
    return `replay demo only: run \`bun run demo:strategy-signals\` in packages/investing`
  }
  return 'not backtestable here: TradingView Pine scripts are only converted offline'
}

/** Deterministic fixture bars generator for offline demo mode or provider fallback. */
function generateDeterministicBars(symbol: string, startDate: string, endDate: string) {
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  const oneDay = 86_400_000
  const days = Math.max(10, Math.min(1000, Math.floor((end - start) / oneDay)))

  let seed = 0
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed * 31 + symbol.charCodeAt(i)) >>> 0
  }
  const rand = () => {
    seed = (seed * 16807 + 1) % 2147483647
    return seed / 2147483647
  }

  const bars = []
  const basePrice = 100 + (seed % 150)
  let currentPrice = basePrice

  for (let i = 0; i < days; i++) {
    const time = start + i * oneDay
    const dayOfWeek = new Date(time).getUTCDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) continue

    const wave = 6 * Math.sin(i / 12) + 3 * Math.cos(i / 4)
    const drift = (i / days) * 15
    const noise = (rand() - 0.49) * 3
    currentPrice = Math.max(10, basePrice + wave + drift + noise)

    const open = currentPrice + (rand() - 0.5) * 2
    const high = Math.max(open, currentPrice) + rand() * 2
    const low = Math.min(open, currentPrice) - rand() * 2
    const volume = 1_000_000 + Math.floor(rand() * 1_000_000)

    bars.push({
      date: new Date(time).toISOString(),
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(currentPrice * 100) / 100,
      volume,
    })
  }
  return bars
}

function calculateMetrics(
  actions: number[],
  closingPrices: number[],
  dates: Date[],
  initialCapital: number,
  feeBps = 0,
  slippageBps = 0,
  positionSizePercent = 100,
) {
  let cash = initialCapital
  let shares = 0
  let trades = 0
  let winningTrades = 0
  let losingTrades = 0
  // Portfolio value sampled each bar, seeded with the starting capital so the
  // drawdown peak begins at initialCapital (matching the prior convention).
  const equityCurve: number[] = [initialCapital]
  // Return of each closed trade, used as its R-multiple for the trust score.
  const tradeReturns: number[] = []
  const signals: TradeSignal[] = []
  let lastBuyPrice = 0
  let lastBuyCost = 0

  const feeRate = feeBps / 10000
  const slippageRate = slippageBps / 10000
  const sizeRatio = Math.max(0.01, Math.min(1, positionSizePercent / 100))

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const price = closingPrices[i]
    const date = dates[i]

    if (action === 1 && shares === 0) {
      // Buy signal: apply slippage and transaction fee
      const execPrice = price * (1 + slippageRate)
      const deployableCash = Math.min(cash, initialCapital * sizeRatio)
      const costPerShare = execPrice * (1 + feeRate)
      shares = Math.floor(deployableCash / costPerShare)

      if (shares > 0) {
        const tradeValue = shares * execPrice
        const fee = tradeValue * feeRate
        cash -= (tradeValue + fee)
        lastBuyPrice = execPrice
        lastBuyCost = tradeValue + fee
        signals.push({
          date: date.toISOString(),
          time: Math.floor(date.getTime() / 1000),
          action: 'BUY',
          price: execPrice,
        })
      }
    } else if (action === -1 && shares > 0) {
      // Sell signal: apply slippage and transaction fee
      const execPrice = price * (1 - slippageRate)
      const tradeValue = shares * execPrice
      const fee = tradeValue * feeRate
      const netRevenue = tradeValue - fee
      cash += netRevenue
      trades++

      const netTradeReturn = lastBuyCost > 0 ? (netRevenue - lastBuyCost) / lastBuyCost : price / lastBuyPrice - 1
      tradeReturns.push(netTradeReturn)

      if (netRevenue > lastBuyCost) {
        winningTrades++
      } else if (netRevenue < lastBuyCost) {
        losingTrades++
      }

      signals.push({
        date: date.toISOString(),
        time: Math.floor(date.getTime() / 1000),
        action: 'SELL',
        price: execPrice,
      })

      shares = 0
      lastBuyCost = 0
    }

    equityCurve.push(cash + shares * price)
  }

  // Close any open positions
  if (shares > 0) {
    const lastPrice = closingPrices[closingPrices.length - 1]
    const lastDate = dates[dates.length - 1]
    const execPrice = lastPrice * (1 - slippageRate)
    const tradeValue = shares * execPrice
    const fee = tradeValue * feeRate
    const netRevenue = tradeValue - fee
    cash += netRevenue
    trades++

    const netTradeReturn = lastBuyCost > 0 ? (netRevenue - lastBuyCost) / lastBuyCost : lastPrice / lastBuyPrice - 1
    tradeReturns.push(netTradeReturn)

    if (netRevenue > lastBuyCost) {
      winningTrades++
    } else if (netRevenue < lastBuyCost) {
      losingTrades++
    }
    signals.push({
      date: lastDate.toISOString(),
      time: Math.floor(lastDate.getTime() / 1000),
      action: 'SELL',
      price: execPrice,
    })
    shares = 0
  }

  const finalValue = cash
  const totalReturn = finalValue - initialCapital
  const totalReturnPercent = (totalReturn / initialCapital) * 100
  const winRate = trades > 0 ? (winningTrades / trades) * 100 : 0
  const maxDrawdown = maxDrawdownPercent(equityCurve)

  // Annualized Sharpe from bar-to-bar equity changes. The first point is the
  // starting capital, so drop it: the first bar has no prior bar to compare.
  const sharpeRatio = sharpeRatioFromEquityCurve(equityCurve.slice(1))

  // Forecaster Trust Score: per-trade Sharpe scaled by sqrt(trade count), so a
  // long consistent record outranks a few lucky trades.
  const trust = computeForecasterTrustScore(tradeReturns, { minSampleSize: TRUST_MIN_TRADES })

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
    trustScore: trust.score,
    trustReliable: trust.reliable,
    trustReason: trust.reason,
    signals,
  }
}

export async function POST(request: NextRequest) {
  try {
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Request body must be valid JSON' },
        { status: 400 }
      )
    }

    const validation = validateBacktestRequest(rawBody)
    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.errors.join('; '), errors: validation.errors },
        { status: 400 }
      )
    }
    const { symbol, startDate, endDate, initialCapital, strategyIds, feeBps, slippageBps, positionSizePercent, demoMode } = validation.value

    console.log(`[Backtest] Request: ${symbol}, ${startDate} to ${endDate}, strategies: ${strategyIds.length > 0 ? strategyIds.join(', ') : 'ALL'}, demoMode: ${demoMode}, feeBps: ${feeBps}, slippageBps: ${slippageBps}`)

    let bars: any[] = []

    if (demoMode) {
      console.log(`[Backtest] Running in fixture-backed demo mode for ${symbol}`)
      bars = generateDeterministicBars(symbol, startDate, endDate)
    } else {
      try {
        const historicalData = await yahooFinance.getHistorical(symbol, {
          period1: new Date(startDate),
          period2: new Date(endDate),
          interval: '1d'
        })

        if (historicalData?.success && historicalData.data) {
          const prices = Array.isArray(historicalData.data)
            ? historicalData.data
            : (historicalData.data as { quotes?: unknown[] }).quotes || []

          bars = prices.filter((p: any) =>
            [p.open, p.high, p.low, p.close].every((v) => typeof v === 'number' && Number.isFinite(v)),
          )
        }
      } catch (err) {
        console.warn(`[Backtest] Live historical fetch error for ${symbol}:`, err)
      }

      // If live fetch returned no bars or failed, fall back to deterministic fixture data
      if (bars.length === 0) {
        console.log(`[Backtest] Live fetch unavailable, falling back to deterministic fixture data for ${symbol}`)
        bars = generateDeterministicBars(symbol, startDate, endDate)
      }
    }

    if (bars.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No historical data available for ' + symbol },
        { status: 500 }
      )
    }

    // Convert to Asset format for indicatorts
    const asset: BacktestAsset = {
      dates: bars.map((p: any) => new Date(p.date)),
      openings: bars.map((p: any) => p.open),
      closings: bars.map((p: any) => p.close),
      highs: bars.map((p: any) => p.high),
      lows: bars.map((p: any) => p.low),
      volumes: bars.map((p: any) => p.volume ?? 0),
    }

    // Filter strategies if specific IDs are provided
    let strategiesToTest: StrategyInfo[] = STRATEGY_INFOS
    let customToTest = CUSTOM_BACKTEST_STRATEGIES
    const replays: RegisteredSource[] = []
    const skipped: { strategyId: string; reason: string }[] = []

    const isAll = strategyIds.length === 0 || strategyIds.includes('all')

    if (!isAll) {
      const selectedNames = strategyIds.map(id => TECHNICAL_STRATEGY_NAME_BY_ID[id]).filter(Boolean)
      strategiesToTest = STRATEGY_INFOS.filter(info => selectedNames.includes(info.name))
      customToTest = CUSTOM_BACKTEST_STRATEGIES.filter(({ id }) => strategyIds.includes(id))
      for (const id of strategyIds) {
        if (BACKTESTABLE_STRATEGY_IDS.has(id)) continue
        const entry = registeredById.get(id)
        if (entry?.backtest === 'daily-bars') replays.push(entry)
        else {
          skipped.push({
            strategyId: id,
            reason: getUnsupportedReason(id, entry),
          })
        }
      }
    } else {
      // Test all supported equity strategies, including hedge-fund-technicals
      for (const entry of registeredSources) {
        if (entry.backtest === 'daily-bars' && entry.venue === 'equity') {
          replays.push(entry)
        }
      }
    }

    // Third-party equity sources replay walk-forward over the same (null-filtered) daily bars.
    const dailyBars = replays.length === 0 ? [] : bars.map((p: any) => ({
      date: new Date(p.date).toISOString().slice(0, 10),
      open: p.open,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
    }))

    const runs: { strategyName: string; strategyId: string; run: () => number[] }[] = [
      ...strategiesToTest.map((info) => ({
        strategyName: info.name,
        strategyId: TECHNICAL_STRATEGY_ID_BY_NAME[info.name]
          || info.name.toLowerCase().replace(/\s+/g, '-'),
        run: () => info.strategy(asset),
      })),
      ...customToTest.map(({ id, name, strategy }) => ({
        strategyName: name,
        strategyId: id,
        run: () => strategy(asset),
      })),
      ...replays.map((entry) => ({
        strategyName: `${entry.name} (${entry.upstreamRepo})`,
        strategyId: entry.source.id,
        run: () => replayDailyActions(entry.source, symbol, dailyBars),
      })),
    ]

    // Calculate metrics for each strategy. One failing strategy is reported
    // under `skipped` instead of failing the whole backtest.
    const results: BacktestResult['results'] = []
    for (const { strategyName, strategyId, run } of runs) {
      try {
        const metrics = calculateMetrics(
          run(),
          asset.closings,
          asset.dates,
          initialCapital,
          feeBps,
          slippageBps,
          positionSizePercent,
        )
        results.push({ strategyName, strategyId, ...metrics })
      } catch (error) {
        console.error(`[Backtest] ${strategyName} failed:`, error)
        skipped.push({ strategyId, reason: `failed: ${(error as Error).message}` })
      }
    }

    // Sort by total return
    results.sort((a, b) => b.totalReturnPercent - a.totalReturnPercent)

    const response: BacktestResult = {
      success: true,
      symbol,
      startDate,
      endDate,
      initialCapital,
      feeBps,
      slippageBps,
      positionSizePercent,
      demoMode,
      results,
      ...(skipped.length ? { skipped } : {}),
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
