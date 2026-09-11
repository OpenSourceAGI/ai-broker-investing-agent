/**
 * @fileoverview Ticker symbol validation shared by the stock API routes.
 *
 * The symbol arrives as a URL path segment typed by a user, so it is entirely
 * untrusted: search boxes send partial tickers while someone is still typing
 * ("GOO", "GOOH", "GOOHL" on the way to "GOOGL"), and every one of those used
 * to reach the upstream data providers. Validating here turns those into a
 * cheap local 400/404 instead of a provider round-trip, and — just as
 * importantly — keeps an unknown ticker from being reported as a 500, which
 * reads as "our server is broken" when it means "no such stock".
 */
import stockNamesData from '@/packages/investing/src/stock-names-data/stock-names.json'

/** `[symbol, name, industryId, marketCap, flags]` as stored in stock-names.json. */
type StockNameEntry = [string, string, number, number, number]

/**
 * Tickers are 1-5 letters, optionally with a class/exchange suffix such as
 * `BRK.B`, `RDS-A`, or `BF/B`. Anything longer or carrying other characters is
 * not a ticker anyone can look up.
 */
const SYMBOL_PATTERN = /^[A-Z]{1,5}(?:[.\-/][A-Z]{1,4})?$/

/** Longest string worth pattern-matching; guards against absurd path segments. */
const MAX_SYMBOL_LENGTH = 12

let knownSymbols: Set<string> | null = null

/**
 * The set of tickers present in the bundled stock-names dataset, built once on
 * first use. The dataset has tens of thousands of rows, so a `Set` keeps the
 * per-request check O(1) rather than scanning the array each time.
 */
function getKnownSymbols(): Set<string> {
  if (knownSymbols === null) {
    knownSymbols = new Set(
      (stockNamesData as StockNameEntry[]).map((entry) => entry[0]),
    )
  }
  return knownSymbols
}

/** Trim, strip a URL encoding, and upper-case. Returns `''` for junk input. */
export function normalizeSymbol(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return ''
  let value = raw.trim()
  if (value.includes('%')) {
    try {
      value = decodeURIComponent(value)
    } catch {
      // A malformed escape sequence is not a symbol; fall through and let the
      // pattern check below reject the raw value.
    }
  }
  return value.trim().toUpperCase()
}

/** True when `symbol` is shaped like a ticker, regardless of whether it exists. */
export function isValidSymbolFormat(symbol: string): boolean {
  return symbol.length > 0 && symbol.length <= MAX_SYMBOL_LENGTH && SYMBOL_PATTERN.test(symbol)
}

/** True when `symbol` appears in the bundled ticker dataset. */
export function isKnownSymbol(symbol: string): boolean {
  return getKnownSymbols().has(symbol)
}

/** Outcome of {@link validateSymbol}: the normalized symbol, or why it failed. */
export type SymbolValidation =
  | { ok: true; symbol: string }
  | { ok: false; symbol: string; status: 400 | 404; error: string; code: string }

/**
 * Normalize and check a symbol from a request.
 *
 * @param raw - The raw path segment or query value.
 * @param options.requireKnown - Also require the ticker to exist in the bundled
 *   dataset. The dataset covers US listings only, so routes that legitimately
 *   serve other venues (forex, crypto, foreign listings) pass `false` and get
 *   format checking alone.
 */
export function validateSymbol(
  raw: string | null | undefined,
  options: { requireKnown?: boolean } = {},
): SymbolValidation {
  const { requireKnown = true } = options
  const symbol = normalizeSymbol(raw)

  if (!symbol) {
    return {
      ok: false,
      symbol,
      status: 400,
      error: 'A stock symbol is required',
      code: 'MISSING_SYMBOL',
    }
  }

  if (!isValidSymbolFormat(symbol)) {
    return {
      ok: false,
      symbol,
      status: 400,
      error: `"${symbol}" is not a valid stock symbol`,
      code: 'INVALID_SYMBOL',
    }
  }

  if (requireKnown && !isKnownSymbol(symbol)) {
    return {
      ok: false,
      symbol,
      status: 404,
      error: `Unknown stock symbol: ${symbol}`,
      code: 'SYMBOL_NOT_FOUND',
    }
  }

  return { ok: true, symbol }
}
