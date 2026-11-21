import { describe, expect, it } from 'vitest'
import {
  DEFAULT_INITIAL_CAPITAL,
  MAX_INITIAL_CAPITAL,
  validateBacktestRequest,
} from '../backtest-request'

const valid = {
  symbol: 'AAPL',
  startDate: '2024-01-01',
  endDate: '2024-06-01',
  initialCapital: 50_000,
  strategyIds: ['macd', 'rsi'],
}

function errorsOf(body: unknown): string[] {
  const result = validateBacktestRequest(body)
  if (result.ok) throw new Error('expected validation to fail')
  return result.errors
}

describe('validateBacktestRequest', () => {
  it('accepts a well-formed request unchanged', () => {
    expect(validateBacktestRequest(valid)).toEqual({ ok: true, value: valid })
  })

  it('applies defaults only when optional fields are absent', () => {
    const { symbol, startDate, endDate } = valid
    const result = validateBacktestRequest({ symbol, startDate, endDate })
    expect(result).toEqual({
      ok: true,
      value: { symbol, startDate, endDate, initialCapital: DEFAULT_INITIAL_CAPITAL, strategyIds: [] },
    })
  })

  it('trims the symbol and dedupes strategy ids', () => {
    const result = validateBacktestRequest({ ...valid, symbol: ' MSFT ', strategyIds: ['a', 'a', 'b'] })
    expect(result.ok && result.value.symbol).toBe('MSFT')
    expect(result.ok && result.value.strategyIds).toEqual(['a', 'b'])
  })

  it.each(['BRK-B', 'BRK.B', '^GSPC', 'EURUSD=X', 'BTC-USD'])('accepts ticker %s', (symbol) => {
    expect(validateBacktestRequest({ ...valid, symbol }).ok).toBe(true)
  })

  it.each(['', '   ', 'A B', 'AAPL;DROP', '../etc', 'X'.repeat(21)])('rejects symbol %j', (symbol) => {
    expect(validateBacktestRequest({ ...valid, symbol }).ok).toBe(false)
  })

  it.each([null, 'text', 5, []])('rejects non-object body %j', (body) => {
    expect(errorsOf(body)).toEqual(['Request body must be a JSON object'])
  })

  it('reports missing required fields together', () => {
    expect(errorsOf({})).toEqual(['symbol is required', 'startDate is required', 'endDate is required'])
  })

  it('rejects unparseable dates with a specific message', () => {
    const errors = errorsOf({ ...valid, startDate: 'not-a-date', endDate: 20240601 })
    expect(errors).toContain('startDate must be a valid date (YYYY-MM-DD)')
    expect(errors).toContain('endDate must be a valid date (YYYY-MM-DD)')
  })

  it('rejects a start date that is not before the end date', () => {
    expect(errorsOf({ ...valid, startDate: '2024-06-01', endDate: '2024-01-01' })).toEqual([
      'startDate must be before endDate',
    ])
    expect(errorsOf({ ...valid, startDate: '2024-06-01', endDate: '2024-06-01' })).toEqual([
      'startDate must be before endDate',
    ])
  })

  // The Strategies tab sends parseInt('') === NaN, which JSON encodes as null,
  // when the user clears the capital box. That used to produce a silent NaN run.
  it.each([null, NaN, 0, -1, '100000', Infinity, {}])('rejects initialCapital %j', (initialCapital) => {
    expect(errorsOf({ ...valid, initialCapital })).toEqual(['initialCapital must be a positive number'])
  })

  it('rejects an absurdly large initialCapital', () => {
    expect(errorsOf({ ...valid, initialCapital: MAX_INITIAL_CAPITAL + 1 })).toHaveLength(1)
    expect(validateBacktestRequest({ ...valid, initialCapital: MAX_INITIAL_CAPITAL }).ok).toBe(true)
  })

  it.each(['macd', [1], [''], [null], { a: 1 }])('rejects strategyIds %j', (strategyIds) => {
    expect(errorsOf({ ...valid, strategyIds })).toEqual(['strategyIds must be an array of non-empty strings'])
  })

  it('caps the number of strategy ids', () => {
    const strategyIds = Array.from({ length: 101 }, (_, i) => `s${i}`)
    expect(errorsOf({ ...valid, strategyIds })).toHaveLength(1)
  })
})
