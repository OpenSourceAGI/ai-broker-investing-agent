/** Credential-free, reviewed synthetic prices. Dollar OHLC and raw nullable volume shape. */
export function openBBTrendRows(direction: 'up' | 'down') {
  return Array.from({ length: 160 }, (_, i) => {
    const close = direction === 'up' ? 100 + i * 0.5 : 300 - i * 0.5
    return { date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), open: close, high: close + 1, low: close - 1, close, volume: 1000 + i * 20 }
  })
}
