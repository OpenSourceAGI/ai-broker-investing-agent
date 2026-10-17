import { describe, it, expect } from 'vitest'
import { maxDrawdownPercent } from '../backtest-metrics'

describe('maxDrawdownPercent', () => {
  it('returns 0 for a flat curve', () => {
    expect(maxDrawdownPercent([100, 100, 100])).toBe(0)
  })

  it('returns 0 for a monotonically rising curve', () => {
    expect(maxDrawdownPercent([100, 110, 125, 200])).toBe(0)
  })

  it('computes a single peak-to-trough decline as a percentage', () => {
    // 100 -> 70 is a 30% decline; the later rise to 120 sets a new peak.
    expect(maxDrawdownPercent([100, 70, 120])).toBeCloseTo(30, 10)
  })

  it('selects the deepest percentage decline across multiple peaks and troughs', () => {
    // Legs: 100->50 (50%), new peak 200, 200->140 (30%). Deepest is 50%.
    expect(maxDrawdownPercent([100, 50, 200, 140])).toBeCloseTo(50, 10)
  })

  it('measures drawdown from the running peak, not the global maximum', () => {
    // Global max is 200 and global min is 90, but the trough at 90 follows a
    // peak of 120, so the deepest decline is 120->90 = 25%, not (200-90)/200.
    expect(maxDrawdownPercent([100, 120, 90, 200, 180])).toBeCloseTo(25, 10)
  })

  it('ranks by percentage decline, not absolute dollar drop', () => {
    // 100->80 is a 20 dollar / 20% drop; 300->150 is a 150 dollar / 50% drop.
    expect(maxDrawdownPercent([100, 80, 300, 150])).toBeCloseTo(50, 10)
  })

  it('reports a full 100% drawdown when equity falls to zero from a peak', () => {
    expect(maxDrawdownPercent([100, 0])).toBe(100)
  })

  it('returns a number, never NaN or Infinity, for degenerate inputs', () => {
    // Empty curve: no equity observed.
    expect(maxDrawdownPercent([])).toBe(0)
    // Single point: nothing to decline from.
    expect(maxDrawdownPercent([100])).toBe(0)
    // Non-positive peaks are skipped until a positive peak exists.
    const nonPositive = maxDrawdownPercent([-10, -20, -5])
    expect(Number.isFinite(nonPositive)).toBe(true)
    expect(nonPositive).toBe(0)
  })
})
