/**
 * Browser-side stale-while-revalidate cache for the stock ticker banner.
 *
 * The ticker renders whatever is in the cache immediately on page load, even
 * when it is out of date, and then refreshes it in the background once it is
 * older than {@link TICKER_CACHE_TTL}. Fresh quotes replace the cached ones in
 * place as they arrive, so the banner never blanks out while it updates.
 */

/** Refresh the cached quotes once an hour. */
export const TICKER_CACHE_HOURLY = 60 * 60 * 1000
/** Refresh the cached quotes once a day. */
export const TICKER_CACHE_DAILY = 24 * 60 * 60 * 1000

/**
 * How old the cached quotes may get before the ticker refetches them.
 * Switch to {@link TICKER_CACHE_DAILY} for a daily refresh.
 */
export const TICKER_CACHE_TTL = TICKER_CACHE_HOURLY

/** localStorage key. Bump the version when the cached data shape changes. */
export const TICKER_CACHE_KEY = "stock-ticker-cache:v1"

export interface TickerCacheEntry<T> {
  /** Epoch ms when the full watchlist was last fetched successfully. */
  savedAt: number
  data: T[]
}

type StorageLike = Pick<Storage, "getItem" | "setItem">

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    // Access can throw in private mode or when site data is blocked.
    return null
  }
}

/** Read the cached quotes, or `null` when there is no usable cache. */
export function readTickerCache<T extends { symbol: string }>(
  storage: StorageLike | null = defaultStorage(),
): TickerCacheEntry<T> | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(TICKER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TickerCacheEntry<T>>
    if (
      typeof parsed?.savedAt !== "number" ||
      !Array.isArray(parsed.data) ||
      parsed.data.length === 0
    ) {
      return null
    }
    return { savedAt: parsed.savedAt, data: parsed.data }
  } catch {
    return null
  }
}

/** Persist quotes. Failures (quota, blocked storage) are ignored. */
export function writeTickerCache<T>(
  data: T[],
  savedAt: number,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage || data.length === 0) return
  try {
    storage.setItem(TICKER_CACHE_KEY, JSON.stringify({ savedAt, data }))
  } catch {
    // ignore
  }
}

/** Milliseconds until the entry goes stale; 0 when it already is. */
export function msUntilStale(
  entry: Pick<TickerCacheEntry<unknown>, "savedAt"> | null,
  now: number = Date.now(),
  ttl: number = TICKER_CACHE_TTL,
): number {
  if (!entry) return 0
  // A savedAt in the future means a skewed clock: treat it as stale.
  if (entry.savedAt > now) return 0
  return Math.max(0, entry.savedAt + ttl - now)
}

export function isTickerCacheStale(
  entry: Pick<TickerCacheEntry<unknown>, "savedAt"> | null,
  now: number = Date.now(),
  ttl: number = TICKER_CACHE_TTL,
): boolean {
  return msUntilStale(entry, now, ttl) === 0
}

/**
 * Merge freshly fetched quotes over the current ones by symbol, keeping only
 * symbols in `order` and returning them in that order. Symbols that failed to
 * refresh keep their previous (stale) quote instead of disappearing.
 */
export function mergeTickerData<T extends { symbol: string }>(
  current: T[],
  incoming: T[],
  order: string[],
): T[] {
  const bySymbol = new Map<string, T>()
  for (const item of current) bySymbol.set(item.symbol, item)
  for (const item of incoming) bySymbol.set(item.symbol, item)
  const result: T[] = []
  for (const symbol of order) {
    const item = bySymbol.get(symbol)
    if (item) result.push(item)
  }
  return result
}
