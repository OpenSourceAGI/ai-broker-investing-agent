import type { StockData } from '../trading-agents/types'
import type { StrategySource } from './types'

/** Longest hedge-fund-technicals lookback is the 126-day momentum sum, so 127 bars. */
export const DAILY_REPLAY_WARMUP_BARS = 127

/** Walk-forward daily replay of an equity source: the decision for bar i sees bars ≤ i only
 * and is evaluated after that bar's close. Returns 1 (BUY), -1 (SELL) or 0 per bar. */
export function replayDailyActions(
  source: StrategySource<{ symbol: string; bars: StockData[] }>,
  symbol: string,
  bars: StockData[],
  // shortcut: trailing 1-year window bounds Worker CPU; use an expanding window if upstream parity on long series matters
  windowBars = 252,
  warmupBars = DAILY_REPLAY_WARMUP_BARS
): Array<-1 | 0 | 1> {
  // Validate the whole series once: warmup and the trailing window never show early bars to run().
  if (bars.length)
    source.run({ symbol, bars }, { evaluationTime: `${bars[bars.length - 1].date}T23:59:59Z` })
  return bars.map((bar, i) => {
    if (i + 1 < warmupBars) return 0
    const [signal] = source.run(
      { symbol, bars: bars.slice(Math.max(0, i + 1 - windowBars), i + 1) },
      { evaluationTime: `${bar.date}T23:59:59Z` }
    )
    return signal?.action === 'BUY' ? 1 : signal?.action === 'SELL' ? -1 : 0
  })
}
