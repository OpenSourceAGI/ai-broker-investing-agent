import type { SeriesMarker, Time } from 'lightweight-charts'

export interface TradeMarkerInput {
  /** Calendar date of the fill, YYYY-MM-DD (or any ISO timestamp). */
  date: string
  action: 'BUY' | 'SELL'
}

const DAY_MS = 86_400_000

/** UTC midnight of the value's calendar day, or NaN when it is not a date. */
const dayStart = (value: string) => {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? NaN : Math.floor(ms / DAY_MS) * DAY_MS
}

/**
 * Chart markers for backtest fills. Each fill goes on the bar whose period
 * contains its day (the last bar starting on or before it), so fills line up
 * on daily, weekly and gappy series alike. Fills before the first bar or past
 * the last bar's period are not drawn, because lightweight-charts would pile
 * them onto the edge bars; they are counted in `outside` so the chart can say
 * so. Unparseable dates are skipped. Markers come back sorted by time.
 */
export function toTradeMarkers(
  trades: TradeMarkerInput[],
  bars: { date: string; time: number }[],
): { markers: SeriesMarker<Time>[]; outside: number } {
  if (trades.length === 0) return { markers: [], outside: 0 }

  const periods = bars
    .map((bar) => ({ start: dayStart(bar.date), time: bar.time }))
    .filter((p) => !Number.isNaN(p.start))
    .sort((a, b) => a.start - b.start)
  const last = periods.at(-1)
  // The last period runs as long as the gap to the previous distinct day (a
  // week for weekly bars), and at least one day, since intraday bars share a day.
  const prevDay = last ? periods.findLast((p) => p.start < last.start) : undefined
  const lastEnd = last ? last.start + Math.max(DAY_MS, prevDay ? last.start - prevDay.start : DAY_MS) : NaN

  const markers: SeriesMarker<Time>[] = []
  let outside = 0
  for (const trade of trades) {
    const day = dayStart(trade.date)
    if (Number.isNaN(day) || !last || day < periods[0].start || day >= lastEnd) {
      outside++
      continue
    }
    // Binary search for the last period starting on or before the fill day.
    let lo = 0
    let hi = periods.length - 1
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (periods[mid].start <= day) lo = mid
      else hi = mid - 1
    }
    const buy = trade.action === 'BUY'
    markers.push({
      time: periods[lo].time as Time,
      position: buy ? 'belowBar' : 'aboveBar',
      shape: buy ? 'arrowUp' : 'arrowDown',
      color: buy ? '#16a34a' : '#dc2626',
      text: trade.action,
    })
  }
  markers.sort((a, b) => (a.time as number) - (b.time as number))
  return { markers, outside }
}
