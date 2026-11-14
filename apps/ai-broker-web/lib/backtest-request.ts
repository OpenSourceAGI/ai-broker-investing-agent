/**
 * @fileoverview Pure validation for `/api/backtest-technical` request bodies.
 *
 * Kept free of I/O so it can be unit-tested. A backtest never places orders or
 * needs broker credentials; this only decides whether a request is well formed
 * before any market data is fetched, so bad input gets a precise 400 instead of
 * a misleading upstream-fetch 500 or a silent `NaN` result.
 */

export const DEFAULT_INITIAL_CAPITAL = 100_000
export const MAX_INITIAL_CAPITAL = 1_000_000_000_000
export const MAX_STRATEGY_IDS = 100

export interface ValidBacktestRequest {
  symbol: string
  startDate: string
  endDate: string
  initialCapital: number
  strategyIds: string[]
}

export type BacktestRequestValidation =
  | { ok: true; value: ValidBacktestRequest }
  | { ok: false; errors: string[] }

// Yahoo-style tickers: AAPL, BRK-B, BRK.B, ^GSPC, EURUSD=X, BTC-USD.
const SYMBOL_PATTERN = /^[A-Za-z0-9^][A-Za-z0-9.\-=^]{0,19}$/

function parseDate(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

/**
 * Validates and normalises a backtest request body. All problems are reported
 * together so a client can fix them in one pass. A missing `initialCapital`
 * (`undefined`) takes the default; `null`, `NaN`-as-null, strings, zero and
 * negative values are rejected rather than silently defaulted.
 */
export function validateBacktestRequest(body: unknown): BacktestRequestValidation {
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return { ok: false, errors: ['Request body must be a JSON object'] }

  const input = body as Record<string, unknown>
  const errors: string[] = []

  const symbol = typeof input.symbol === 'string' ? input.symbol.trim() : ''
  if (!symbol) errors.push('symbol is required')
  else if (!SYMBOL_PATTERN.test(symbol)) errors.push(`symbol "${symbol}" is not a valid ticker`)

  const start = parseDate(input.startDate)
  const end = parseDate(input.endDate)
  if (input.startDate === undefined || input.startDate === '') errors.push('startDate is required')
  else if (start === null) errors.push('startDate must be a valid date (YYYY-MM-DD)')
  if (input.endDate === undefined || input.endDate === '') errors.push('endDate is required')
  else if (end === null) errors.push('endDate must be a valid date (YYYY-MM-DD)')
  if (start !== null && end !== null && start >= end) errors.push('startDate must be before endDate')

  let initialCapital = DEFAULT_INITIAL_CAPITAL
  if (input.initialCapital !== undefined) {
    const capital = input.initialCapital
    if (typeof capital !== 'number' || !Number.isFinite(capital) || capital <= 0)
      errors.push('initialCapital must be a positive number')
    else if (capital > MAX_INITIAL_CAPITAL)
      errors.push(`initialCapital must not exceed ${MAX_INITIAL_CAPITAL}`)
    else initialCapital = capital
  }

  let strategyIds: string[] = []
  if (input.strategyIds !== undefined) {
    const ids = input.strategyIds
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.trim() === ''))
      errors.push('strategyIds must be an array of non-empty strings')
    else if (ids.length > MAX_STRATEGY_IDS)
      errors.push(`strategyIds must not contain more than ${MAX_STRATEGY_IDS} entries`)
    else strategyIds = [...new Set(ids as string[])]
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      symbol,
      startDate: input.startDate as string,
      endDate: input.endDate as string,
      initialCapital,
      strategyIds,
    },
  }
}
