import type { StockData } from '../../trading-agents/types'

/** Independent mapping of the public OpenBB equity-historical row contract. */
export function fromOpenBBBars(input: unknown): { bars: StockData[]; missingVolume: number } {
  if (!Array.isArray(input)) throw new Error('OpenBB rows must be an array')
  let missingVolume = 0
  const dates = new Set<string>()
  const bars = input.map((row: unknown): StockData => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('invalid OpenBB row')
    const r = row as Record<string, unknown>
    if (
      typeof r.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(r.date)
    )
      throw new Error('invalid OpenBB date')
    // A provider's naive datetime is interpreted as UTC; explicit offsets normalize to UTC.
    const day = r.date.slice(0, 10)
    if (!Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)
      throw new Error('invalid OpenBB calendar date')
    const timestamp =
      r.date.includes('T') && !/(Z|[+-]\d{2}:\d{2})$/.test(r.date) ? `${r.date}Z` : r.date
    if (!Number.isFinite(Date.parse(timestamp))) throw new Error('invalid OpenBB date')
    const date = new Date(timestamp).toISOString().slice(0, 10)
    if (dates.has(date)) throw new Error(`duplicate OpenBB date: ${date}`)
    dates.add(date)
    for (const key of ['open', 'high', 'low', 'close']) {
      if (typeof r[key] !== 'number' || !Number.isFinite(r[key]) || (r[key] as number) <= 0)
        throw new Error(`invalid OpenBB ${key}`)
    }
    const open = r.open as number,
      high = r.high as number,
      low = r.low as number,
      close = r.close as number
    if (low > Math.min(open, close) || high < Math.max(open, close) || low > high)
      throw new Error('inconsistent OpenBB OHLC')
    const absent = r.volume === null || r.volume === undefined
    if (!absent && (typeof r.volume !== 'number' || !Number.isFinite(r.volume) || r.volume < 0))
      throw new Error('invalid OpenBB volume')
    if (absent) missingVolume++
    return {
      date,
      open,
      high,
      low,
      close,
      volume: absent ? 0 : (r.volume as number),
      missingVolume: absent ? 1 : 0
    }
  })
  return { bars: bars.sort((a, b) => a.date.localeCompare(b.date)), missingVolume }
}
