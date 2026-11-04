import { describe, it, expect } from "vitest"
import {
  TICKER_CACHE_KEY,
  TICKER_CACHE_HOURLY,
  TICKER_CACHE_DAILY,
  TICKER_CACHE_TTL,
  readTickerCache,
  writeTickerCache,
  msUntilStale,
  isTickerCacheStale,
  mergeTickerData,
} from "../stock-ticker-cache"

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  }
}

const q = (symbol: string, price = 1) => ({ symbol, price })

describe("stock ticker cache", () => {
  it("defaults to an hourly TTL", () => {
    expect(TICKER_CACHE_TTL).toBe(TICKER_CACHE_HOURLY)
    expect(TICKER_CACHE_DAILY).toBe(24 * TICKER_CACHE_HOURLY)
  })

  it("round-trips data through storage", () => {
    const s = memoryStorage()
    writeTickerCache([q("AAPL", 200)], 1000, s)
    expect(readTickerCache(s)).toEqual({ savedAt: 1000, data: [q("AAPL", 200)] })
  })

  it("returns null for missing, corrupt or empty entries", () => {
    const s = memoryStorage()
    expect(readTickerCache(s)).toBeNull()
    s.setItem(TICKER_CACHE_KEY, "{not json")
    expect(readTickerCache(s)).toBeNull()
    s.setItem(TICKER_CACHE_KEY, JSON.stringify({ savedAt: 1, data: [] }))
    expect(readTickerCache(s)).toBeNull()
    expect(readTickerCache(null)).toBeNull()
  })

  it("does not overwrite the cache with an empty list", () => {
    const s = memoryStorage()
    writeTickerCache([q("AAPL")], 1, s)
    writeTickerCache([], 2, s)
    expect(readTickerCache(s)?.savedAt).toBe(1)
  })

  it("survives storage that throws", () => {
    const throwing = {
      getItem: () => { throw new Error("blocked") },
      setItem: () => { throw new Error("quota") },
    }
    expect(readTickerCache(throwing)).toBeNull()
    expect(() => writeTickerCache([q("AAPL")], 1, throwing)).not.toThrow()
  })

  it("computes staleness against the TTL", () => {
    const ttl = TICKER_CACHE_HOURLY
    expect(msUntilStale(null, 0, ttl)).toBe(0)
    expect(msUntilStale({ savedAt: 0 }, 1000, ttl)).toBe(ttl - 1000)
    expect(isTickerCacheStale({ savedAt: 0 }, ttl - 1, ttl)).toBe(false)
    expect(isTickerCacheStale({ savedAt: 0 }, ttl, ttl)).toBe(true)
    // A timestamp from the future (clock skew) is treated as stale.
    expect(isTickerCacheStale({ savedAt: 5000 }, 1000, ttl)).toBe(true)
    // Daily TTL keeps an hour-old entry fresh.
    expect(isTickerCacheStale({ savedAt: 0 }, TICKER_CACHE_HOURLY, TICKER_CACHE_DAILY)).toBe(false)
  })

  it("merges fresh quotes in place, keeps stale ones, and follows watchlist order", () => {
    const current = [q("AAPL", 1), q("MSFT", 1), q("OLD", 1)]
    const incoming = [q("MSFT", 2), q("NVDA", 3)]
    expect(mergeTickerData(current, incoming, ["NVDA", "AAPL", "MSFT"])).toEqual([
      q("NVDA", 3),
      q("AAPL", 1),
      q("MSFT", 2),
    ])
  })
})
