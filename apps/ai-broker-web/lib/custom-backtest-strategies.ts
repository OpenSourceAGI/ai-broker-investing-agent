/**
 * Adapters that let the technical backtest route run the strategies ported in
 * `packages/investing/src/stocks/strategies` alongside the `indicatorts` ones.
 *
 * Each adapter turns OHLC bars into the same action array `indicatorts`
 * strategies return: `1` = buy, `-1` = sell, `0` = hold. The backtest in
 * `app/api/backtest-technical/route.ts` is long-only, so only long entries and
 * long exits become actions.
 */
import { evaluateBbRsiBreakout } from '@/packages/investing/src/stocks/strategies/bb-rsi-breakout'
import { evaluateEmaCrossover } from '@/packages/investing/src/stocks/strategies/ema-crossover'
import { CUSTOM_TECHNICAL_STRATEGIES } from '@/lib/technical-strategies'

export interface BacktestAsset {
  dates: Date[]
  openings: number[]
  closings: number[]
  highs: number[]
  lows: number[]
  volumes: number[]
}

export interface CustomBacktestStrategy {
  id: string
  name: string
  strategy: (asset: BacktestAsset) => number[]
}

function toBars(asset: BacktestAsset) {
  return asset.dates.map((date, i) => ({
    date: date.toISOString(),
    close: asset.closings[i],
    high: asset.highs[i],
    low: asset.lows[i],
  }))
}

/** EMA 9/20 crossover with a 200 EMA trend filter. Already long-only. */
function emaCrossoverActions(asset: BacktestAsset): number[] {
  return evaluateEmaCrossover(toBars(asset)).map((signal) =>
    signal.action === 'BUY' ? 1 : signal.action === 'SELL' ? -1 : 0,
  )
}

/**
 * BB + RSI breakout. The strategy is bidirectional and emits at most one
 * position change per bar, so walking its signals with the same position state
 * tells a long entry or exit apart from a short entry or cover. Only the long
 * leg is kept; short entries and covers become holds.
 */
function bbRsiBreakoutActions(asset: BacktestAsset): number[] {
  let position: 'none' | 'long' | 'short' = 'none'
  return evaluateBbRsiBreakout(toBars(asset)).map((signal) => {
    if (signal.action === 'BUY') {
      if (position === 'none') {
        position = 'long'
        return 1
      }
      position = 'none' // cover short
      return 0
    }
    if (signal.action === 'SELL') {
      if (position === 'long') {
        position = 'none'
        return -1
      }
      position = 'short' // short entry
      return 0
    }
    return 0
  })
}

const ACTIONS_BY_ID: Record<string, (asset: BacktestAsset) => number[]> = {
  'ema-crossover': emaCrossoverActions,
  'bb-rsi-breakout': bbRsiBreakoutActions,
}

export const CUSTOM_BACKTEST_STRATEGIES: readonly CustomBacktestStrategy[] =
  CUSTOM_TECHNICAL_STRATEGIES.map(({ id, name }) => ({
    id,
    name,
    strategy: ACTIONS_BY_ID[id],
  }))
