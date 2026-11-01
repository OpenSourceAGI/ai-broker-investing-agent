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

import { sharpeRatioFromEquityCurve } from '../backtest-metrics'

describe('sharpeRatioFromEquityCurve', () => {
  it('is undefined for a flat curve (a strategy that never traded)', () => {
    expect(sharpeRatioFromEquityCurve([100, 100, 100, 100])).toBeUndefined()
  })

  it('is undefined with fewer than two returns', () => {
    expect(sharpeRatioFromEquityCurve([100, 110])).toBeUndefined()
  })

  it('is positive for a curve that mostly rises and negative for one that mostly falls', () => {
    expect(sharpeRatioFromEquityCurve([100, 101, 103, 102, 105, 107])).toBeGreaterThan(0)
    expect(sharpeRatioFromEquityCurve([100, 99, 97, 98, 95, 93])).toBeLessThan(0)
  })

  it('annualizes the mean / std of bar returns by sqrt(periodsPerYear)', () => {
    const curve = [100, 110, 99, 108.9]
    const returns = [0.1, -0.1, 0.1]
    const mean = returns.reduce((a, b) => a + b, 0) / 3
    const std = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / 3)
    expect(sharpeRatioFromEquityCurve(curve, 1)).toBeCloseTo(mean / std, 6)
  })
})
