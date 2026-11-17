/**
 * Per-stock backtests. This route only validates the request, loads daily
 * bars and hands both to packages/investing, which owns every strategy, the
 * simulator and the cost model. It never touches a broker.
 *
 * GET  → the strategy catalog with availability for stocks, cost defaults
 *        and limits, and the symbols covered by demo mode.
 * POST → run the selected strategies (or "all") for one symbol.
 *
 * Demo mode (`demo: true` in the body, or BACKTEST_DEMO=1) reads recorded
 * bars instead of calling Yahoo Finance, so it works offline without keys.
 */
import { NextRequest, NextResponse } from 'next/server'
import { yahooFinance } from '@/packages/investing/src/stocks/yahoo-finance-wrapper'
import {
  COST_LIMITS,
  DEFAULT_COSTS,
  describeCatalog,
  runBacktests,
  validateCosts,
  type Bar,
  type CostModel,
} from '@/packages/investing/src/backtest'
import { normalizeBars } from '@/packages/investing/src/backtest/bars'
import { FIXTURE_SYMBOLS, loadFixtureBars } from '@/packages/investing/src/backtest/fixtures'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_CAPITAL = 100_000
/** Bounds the CPU one request can spend (about 2,500 daily bars). */
const MAX_RANGE_YEARS = 10
/** Bounds the request and response size; the catalog has far fewer strategies. */
const MAX_STRATEGY_IDS = 50
const MAX_STRATEGY_ID_LENGTH = 64

interface ParsedRequest {
  symbol: string
  startDate: string
  endDate: string
  initialCapital: number
  strategyIds: string[] | 'all'
  costs: CostModel
  params: Record<string, Record<string, number>>
  demo: boolean
}

function badRequest(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 })
}

function parse(body: Record<string, unknown>): ParsedRequest | { error: string } {
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim().toUpperCase() : ''
  if (!symbol) return { error: 'symbol is required' }

  const { startDate, endDate } = body
  if (typeof startDate !== 'string' || !ISO_DATE.test(startDate)) return { error: 'startDate must be YYYY-MM-DD' }
  if (typeof endDate !== 'string' || !ISO_DATE.test(endDate)) return { error: 'endDate must be YYYY-MM-DD' }
  if (startDate > endDate) return { error: 'startDate must be on or before endDate' }
  const years = (Date.parse(endDate) - Date.parse(startDate)) / (365.25 * 86_400_000)
  if (years > MAX_RANGE_YEARS) return { error: `The date range can be at most ${MAX_RANGE_YEARS} years` }

  const initialCapital = body.initialCapital ?? DEFAULT_CAPITAL
  if (typeof initialCapital !== 'number' || !Number.isFinite(initialCapital) || initialCapital <= 0) {
    return { error: 'initialCapital must be a positive number' }
  }

  const ids = body.strategyIds ?? 'all'
  if (ids !== 'all' && !(Array.isArray(ids) && ids.every((id) => typeof id === 'string'))) {
    return { error: 'strategyIds must be a list of strategy ids or "all"' }
  }
  const unique = ids === 'all' ? [] : [...new Set(ids as string[])]
  if (unique.length > MAX_STRATEGY_IDS) return { error: `strategyIds can list at most ${MAX_STRATEGY_IDS} strategies` }
  if (unique.some((id) => id.length > MAX_STRATEGY_ID_LENGTH)) {
    return { error: `strategy ids can be at most ${MAX_STRATEGY_ID_LENGTH} characters` }
  }
  const strategyIds = unique.length === 0 ? 'all' : unique

  const costResult = validateCosts((body.costs ?? {}) as Partial<CostModel>)
  if ('error' in costResult) return { error: costResult.error }

  const params = body.params && typeof body.params === 'object' ? (body.params as ParsedRequest['params']) : {}
  const demo = body.demo === true || process.env.BACKTEST_DEMO === '1'

  return { symbol, startDate, endDate, initialCapital, strategyIds, costs: costResult.costs, params, demo }
}

async function loadYahooBars(symbol: string, startDate: string, endDate: string): Promise<Bar[] | null> {
  const result = await yahooFinance.getHistorical(symbol, {
    period1: new Date(startDate),
    period2: new Date(`${endDate}T23:59:59Z`),
    interval: '1d',
  })
  if (!result.success || !result.data) return null
  const rows = Array.isArray(result.data) ? result.data : (result.data as { quotes?: unknown[] }).quotes ?? []
  return normalizeBars(rows).filter((b) => b.date >= startDate && b.date <= endDate)
}

export async function GET() {
  return NextResponse.json({
    strategies: describeCatalog('equity'),
    costs: { defaults: DEFAULT_COSTS, limits: COST_LIMITS },
    demoSymbols: FIXTURE_SYMBOLS,
  })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('Request body must be JSON')
  }
  if (!body || typeof body !== 'object') return badRequest('Request body must be a JSON object')

  const parsed = parse(body as Record<string, unknown>)
  if ('error' in parsed) return badRequest(parsed.error)
  const { symbol, startDate, endDate, initialCapital, strategyIds, costs, params, demo } = parsed

  let bars: Bar[] | null
  if (demo) {
    bars = loadFixtureBars(symbol, startDate, endDate)
    if (!bars) {
      return badRequest(`Demo data only covers ${FIXTURE_SYMBOLS.join(', ')}; turn demo mode off to use live data for ${symbol}.`)
    }
  } else {
    try {
      bars = await loadYahooBars(symbol, startDate, endDate)
    } catch (error) {
      console.error('[backtest] Yahoo Finance request failed:', error)
      bars = null
    }
    if (!bars) {
      return NextResponse.json(
        { success: false, error: `Could not load daily bars for ${symbol} from Yahoo Finance. Try again, or turn on demo mode.` },
        { status: 502 },
      )
    }
  }
  if (bars.length === 0) return badRequest(`No daily bars for ${symbol} between ${startDate} and ${endDate}.`)

  const results = runBacktests({ assetClass: 'equity', bars, initialCapital, costs, strategyIds, params })

  return NextResponse.json({
    success: true,
    symbol,
    startDate,
    endDate,
    initialCapital,
    costs,
    dataSource: demo ? 'demo' : 'yahoo',
    barCount: bars.length,
    results,
  })
}
