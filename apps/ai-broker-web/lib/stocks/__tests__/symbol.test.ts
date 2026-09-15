/**
 * @fileoverview Tests for the shared ticker validation the stock routes use to
 * separate "not a ticker" (400) from "no such ticker" (404) before any upstream
 * provider is called.
 */
import { describe, it, expect } from 'vitest'
import {
  isKnownSymbol,
  isValidSymbolFormat,
  normalizeSymbol,
  validateSymbol,
} from '../symbol'

describe('normalizeSymbol', () => {
  it('upper-cases and trims', () => {
    expect(normalizeSymbol('  aapl ')).toBe('AAPL')
  })

  it('decodes a percent-encoded path segment', () => {
    expect(normalizeSymbol('BRK%2EB')).toBe('BRK.B')
  })

  it('returns an empty string for a malformed escape rather than throwing', () => {
    expect(normalizeSymbol('%E0%A4%A')).toBe('%E0%A4%A')
  })

  it.each([null, undefined, 42, {}])('returns an empty string for %s', (input) => {
    expect(normalizeSymbol(input as any)).toBe('')
  })
})

describe('isValidSymbolFormat', () => {
  it.each(['A', 'AAPL', 'GOOGL', 'BRK.B', 'RDS-A', 'BF/B'])('accepts %s', (symbol) => {
    expect(isValidSymbolFormat(symbol)).toBe(true)
  })

  it.each([
    ['', 'empty'],
    ['GOOGLE', 'six letters is past the ticker limit'],
    ['AA PL', 'contains a space'],
    ['AAPL;DROP', 'contains punctuation'],
    ['123', 'digits only'],
    ['aapl', 'not upper-cased — callers normalize first'],
    ['A'.repeat(40), 'absurdly long'],
  ])('rejects %s (%s)', (symbol) => {
    expect(isValidSymbolFormat(symbol)).toBe(false)
  })
})

describe('isKnownSymbol', () => {
  it('finds a ticker present in the bundled dataset', () => {
    expect(isKnownSymbol('AAPL')).toBe(true)
    expect(isKnownSymbol('GOOGL')).toBe(true)
  })

  it('rejects a ticker-shaped string that is not listed', () => {
    expect(isKnownSymbol('ZZZZZ')).toBe(false)
  })
})

describe('validateSymbol', () => {
  it('accepts a real ticker and returns it normalized', () => {
    expect(validateSymbol('aapl')).toEqual({ ok: true, symbol: 'AAPL' })
  })

  it('returns 400 MISSING_SYMBOL for an empty segment', () => {
    const result = validateSymbol('')
    expect(result).toMatchObject({ ok: false, status: 400, code: 'MISSING_SYMBOL' })
  })

  it('returns 400 INVALID_SYMBOL for something not shaped like a ticker', () => {
    const result = validateSymbol('GOOGLE')
    expect(result).toMatchObject({ ok: false, status: 400, code: 'INVALID_SYMBOL' })
  })

  it('returns 404 SYMBOL_NOT_FOUND for a ticker-shaped string with no listing', () => {
    const result = validateSymbol('ZZZZZ')
    expect(result).toMatchObject({ ok: false, status: 404, code: 'SYMBOL_NOT_FOUND' })
  })

  it.each(['GOO', 'GOOH', 'GOOHL'])(
    'rejects the partial ticker %s a search box sends mid-typing',
    (partial) => {
      expect(validateSymbol(partial).ok).toBe(false)
    },
  )

  it('skips the listing check when requireKnown is false', () => {
    expect(validateSymbol('ZZZZZ', { requireKnown: false })).toEqual({
      ok: true,
      symbol: 'ZZZZZ',
    })
  })

  it('still enforces the format when requireKnown is false', () => {
    expect(validateSymbol('NOT A SYMBOL', { requireKnown: false }).ok).toBe(false)
  })
})
