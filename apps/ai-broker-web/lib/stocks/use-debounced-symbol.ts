"use client"

import { useEffect, useState } from "react"
import { isValidSymbolFormat, normalizeSymbol } from "@/lib/stocks/symbol"

/** How long the symbol must hold still before it is worth a network request. */
const DEFAULT_DELAY_MS = 350

/**
 * Settle a symbol that changes as someone types before anything fetches on it.
 *
 * Search inputs push a new symbol on every keystroke, and the panels below them
 * fetch per symbol. Typing "GOOGL" therefore fired a quote and up to three
 * historical requests for each of G, GO, GOO, GOOG and GOOGL — a burst of
 * requests for tickers the user never meant to look up, whose responses could
 * also land out of order and leave the wrong stock on screen.
 *
 * This returns the symbol only once it has stopped changing and looks like a
 * ticker, so callers fetch once for what was actually typed.
 *
 * @param symbol - The live, per-keystroke symbol.
 * @param delayMs - Quiet period required before the symbol is released.
 * @returns The settled upper-cased symbol, or `''` while it is still in flux or
 *   is not ticker-shaped.
 */
export function useDebouncedSymbol(symbol: string, delayMs: number = DEFAULT_DELAY_MS): string {
  const normalized = normalizeSymbol(symbol)
  const usable = isValidSymbolFormat(normalized) ? normalized : ""

  // Seed with the first value so an already-settled symbol (a page opened
  // directly on /stocks/AAPL) renders without waiting out the delay.
  const [settled, setSettled] = useState(usable)

  useEffect(() => {
    if (usable === settled) return

    const timer = setTimeout(() => setSettled(usable), delayMs)
    return () => clearTimeout(timer)
  }, [usable, settled, delayMs])

  return settled
}
