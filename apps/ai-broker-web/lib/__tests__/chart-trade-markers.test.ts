import { describe, it, expect } from 'vitest'
import { toTradeMarkers } from '../chart-trade-markers'

const t = (iso: string) => Math.floor(Date.parse(iso) / 1000)

// Daily bars as providers send them: a timestamp with a time of day.
const daily = [
  { date: '2025-11-17T05:00:00.000Z', time: t('2025-11-17T05:00:00Z') },
  { date: '2025-11-18T05:00:00.000Z', time: t('2025-11-18T05:00:00Z') },
  { date: '2025-11-19T05:00:00.000Z', time: t('2025-11-19T05:00:00Z') },
]

// Weekly bars stamped on Mondays (the 5Y range).
const weekly = [
  { date: '2024-03-04', time: t('2024-03-04') },
  { date: '2024-03-11', time: t('2024-03-11') },
  { date: '2024-03-18', time: t('2024-03-18') },
]

describe('toTradeMarkers', () => {
  it('places each trade on the daily bar from the same calendar day', () => {
    const { markers, outside } = toTradeMarkers([{ date: '2025-11-18', action: 'BUY' }], daily)
    expect(markers.map((m) => m.time)).toEqual([t('2025-11-18T05:00:00Z')])
    expect(outside).toBe(0)
  })

  it('draws buys as green up-arrows below the bar and sells as red down-arrows above it', () => {
    const { markers } = toTradeMarkers(
      [
        { date: '2025-11-17', action: 'BUY' },
        { date: '2025-11-19', action: 'SELL' },
      ],
      daily,
    )
    expect(markers[0]).toMatchObject({ position: 'belowBar', shape: 'arrowUp', text: 'BUY', color: '#16a34a' })
    expect(markers[1]).toMatchObject({ position: 'aboveBar', shape: 'arrowDown', text: 'SELL', color: '#dc2626' })
  })

  it('places mid-week trades on the weekly bar whose week contains them', () => {
    const { markers, outside } = toTradeMarkers(
      [
        { date: '2024-03-06', action: 'BUY' }, // Wednesday
        { date: '2024-03-15', action: 'SELL' }, // Friday
        { date: '2024-03-22', action: 'BUY' }, // Friday of the last week
      ],
      weekly,
    )
    expect(markers.map((m) => m.time)).toEqual([t('2024-03-04'), t('2024-03-11'), t('2024-03-18')])
    expect(outside).toBe(0)
  })

  it('counts trades before the first bar or after the last bar period as outside, without drawing them', () => {
    const { markers, outside } = toTradeMarkers(
      [
        { date: '2024-02-28', action: 'BUY' },
        { date: '2024-03-26', action: 'SELL' },
        { date: '2024-03-12', action: 'BUY' },
      ],
      weekly,
    )
    expect(markers.map((m) => m.time)).toEqual([t('2024-03-11')])
    expect(outside).toBe(2)
  })

  it('keeps fills on the final day of an intraday chart', () => {
    // Hourly bars: the last two share a calendar day.
    const hourly = [
      { date: '2025-11-17T19:30:00.000Z', time: t('2025-11-17T19:30:00Z') },
      { date: '2025-11-18T14:30:00.000Z', time: t('2025-11-18T14:30:00Z') },
      { date: '2025-11-18T15:30:00.000Z', time: t('2025-11-18T15:30:00Z') },
    ]
    const { markers, outside } = toTradeMarkers([{ date: '2025-11-18', action: 'SELL' }], hourly)
    expect(outside).toBe(0)
    expect(markers.map((m) => m.time)).toEqual([t('2025-11-18T15:30:00Z')])
  })

  it('returns markers in time order, as the chart requires', () => {
    const { markers } = toTradeMarkers(
      [
        { date: '2025-11-19', action: 'SELL' },
        { date: '2025-11-17', action: 'BUY' },
      ],
      daily,
    )
    expect(markers.map((m) => m.time)).toEqual([t('2025-11-17T05:00:00Z'), t('2025-11-19T05:00:00Z')])
  })

  it('ignores unparseable dates instead of throwing', () => {
    const bars = [...daily, { date: 'not a date', time: 0 }]
    expect(() => toTradeMarkers([{ date: 'bad', action: 'BUY' }], bars)).not.toThrow()
    expect(toTradeMarkers([{ date: 'bad', action: 'BUY' }], bars)).toEqual({ markers: [], outside: 1 })
    expect(toTradeMarkers([], [{ date: 'not a date', time: 0 }])).toEqual({ markers: [], outside: 0 })
  })
})
