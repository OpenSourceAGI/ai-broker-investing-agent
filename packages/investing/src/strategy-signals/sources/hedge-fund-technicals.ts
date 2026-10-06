import type { StockData } from '../../trading-agents/types'
import type { StrategySource } from '../types'
import { isUtcTime } from '../validate'

/** Independent numerical implementation of the observed technical-analysis contract.
 * Windows, unbiased sample moments and EMA adjustment are pinned against Python references.
 * No vendored code is imported. Upstream's missing notice prevents a translated implementation.
 */
export interface TechnicalsInput {
  symbol: string
  bars: StockData[]
  missingVolume?: number
  quantity?: number
}
export interface TechnicalGroup {
  signal: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  metrics: Record<string, number>
}
export type TechnicalGroups = Record<
  'trend' | 'mean_reversion' | 'momentum' | 'volatility' | 'stat_arb',
  TechnicalGroup
>
const weights = {
  trend: 0.25,
  mean_reversion: 0.2,
  momentum: 0.25,
  volatility: 0.15,
  stat_arb: 0.15
}
const last = (xs: number[]) => xs[xs.length - 1] ?? NaN
const finiteOrZero = (n: number) => (Number.isFinite(n) ? n : 0)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
function variance(xs: number[], ddof = 1): number {
  if (xs.length <= ddof) return NaN
  const m = mean(xs)
  return xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - ddof)
}
function rolling(xs: number[], window: number, fn = mean): number[] {
  return xs.map((_, i) => {
    const values = xs.slice(i + 1 - window, i + 1)
    return i + 1 < window || values.some(x => !Number.isFinite(x)) ? NaN : fn(values)
  })
}
/** pandas ewm(span=n, adjust=...) with ignore_na=False. */
function exponential(xs: number[], span: number, adjust: boolean): number[] {
  const alpha = 2 / (span + 1),
    decay = 1 - alpha
  let average = NaN,
    oldWeight = 1
  return xs.map(x => {
    const observed = Number.isFinite(x)
    if (Number.isFinite(average)) {
      oldWeight *= decay
      if (observed) {
        const newWeight = adjust ? 1 : alpha
        average = (oldWeight * average + newWeight * x) / (oldWeight + newWeight)
        oldWeight = adjust ? oldWeight + newWeight : 1
      }
    } else if (observed) average = x
    return average
  })
}
export function technicalRsi(close: number[], period = 14): number[] {
  const delta = close.map((x, i) => (i ? x - close[i - 1]! : 0))
  const gain = rolling(
    delta.map(x => (x > 0 ? x : 0)),
    period
  )
  const loss = rolling(
    delta.map(x => (x < 0 ? -x : 0)),
    period
  )
  return gain.map((g, i) => 100 - 100 / (1 + g / loss[i]!))
}
export function technicalEma(close: number[], period: number): number[] {
  return exponential(close, period, false)
}
export function technicalBollinger(
  close: number[],
  period = 20
): { upper: number[]; lower: number[] } {
  const avg = rolling(close, period),
    std = rolling(close, period, x => Math.sqrt(variance(x)))
  return { upper: avg.map((x, i) => x + 2 * std[i]!), lower: avg.map((x, i) => x - 2 * std[i]!) }
}
function trueRange(bars: StockData[]): number[] {
  return bars.map((b, i) =>
    i
      ? Math.max(
          b.high - b.low,
          Math.abs(b.high - bars[i - 1]!.close),
          Math.abs(b.low - bars[i - 1]!.close)
        )
      : b.high - b.low
  )
}
export function technicalAtr(bars: StockData[], period = 14): number[] {
  return rolling(trueRange(bars), period)
}
export function technicalAdx(bars: StockData[], period = 14): number[] {
  const plus: number[] = [],
    minus: number[] = []
  bars.forEach((b, i) => {
    const up = i ? b.high - bars[i - 1]!.high : NaN,
      down = i ? bars[i - 1]!.low - b.low : NaN
    plus.push(up > down && up > 0 ? up : 0)
    minus.push(down > up && down > 0 ? down : 0)
  })
  const tr = exponential(trueRange(bars), period, true),
    p = exponential(plus, period, true),
    m = exponential(minus, period, true)
  const dx = tr.map((t, i) => {
    const pd = (100 * p[i]!) / t,
      md = (100 * m[i]!) / t
    return (100 * Math.abs(pd - md)) / (pd + md)
  })
  return exponential(dx, period, true)
}
/** Upstream subtracts pandas Series slices with the original index. Aligned overlap has
 * zero difference, unlike array subtraction. Empty overlaps also fall back to epsilon
 * through Python's max(epsilon, NaN). Don't silently replace it with another estimator.
 */
export function technicalHurst(close: number[], maxLag = 20): number {
  void close
  const xs = Array.from({ length: maxLag - 2 }, (_, i) => Math.log(i + 2))
  const ys = xs.map(() => Math.log(1e-8)),
    mx = mean(xs),
    my = mean(ys)
  return (
    xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0) /
    xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  )
}
function moment(xs: number[], which: 'skew' | 'kurt'): number {
  const n = xs.length,
    avg = mean(xs),
    deviations = xs.map(x => x - avg),
    m2 = mean(deviations.map(x => x ** 2))
  if (m2 < 1e-28) return which === 'skew' ? 0 : -3
  if (which === 'skew')
    return ((Math.sqrt(n * (n - 1)) / (n - 2)) * mean(deviations.map(x => x ** 3))) / m2 ** 1.5
  return (
    ((n - 1) / ((n - 2) * (n - 3))) *
    ((n + 1) * (mean(deviations.map(x => x ** 4)) / m2 ** 2 - 3) + 6)
  )
}
function group(
  signal: TechnicalGroup['signal'],
  confidence: number,
  metrics: Record<string, number>
): TechnicalGroup {
  return {
    signal,
    confidence,
    metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, finiteOrZero(v)]))
  }
}
export function combineTechnicalSignals(groups: TechnicalGroups): {
  signal: TechnicalGroup['signal']
  confidence: number
  score: number
} {
  let total = 0,
    sum = 0
  for (const name of Object.keys(weights) as Array<keyof TechnicalGroups>) {
    const g = groups[name],
      weight = weights[name] * g.confidence
    total += weight
    sum += weight * (g.signal === 'bullish' ? 1 : g.signal === 'bearish' ? -1 : 0)
  }
  const score = total > 0 ? sum / total : 0
  return {
    signal: score > 0.2 ? 'bullish' : score < -0.2 ? 'bearish' : 'neutral',
    confidence: Math.abs(score),
    score
  }
}
export function analyzeTechnicals(bars: StockData[]): {
  groups: TechnicalGroups
  combined: ReturnType<typeof combineTechnicalSignals>
} {
  const close = bars.map(b => b.close),
    volume = bars.map(b => b.volume)
  const returns = close.map((c, i) => (i ? c / close[i - 1]! - 1 : NaN))
  const ema8 = last(technicalEma(close, 8)),
    ema21 = last(technicalEma(close, 21)),
    ema55 = last(technicalEma(close, 55)),
    adx = last(technicalAdx(bars))
  const bullish = ema8 > ema21 && ema21 > ema55,
    bearish = !(ema8 > ema21) && !(ema21 > ema55)
  const trend = group(
    bullish ? 'bullish' : bearish ? 'bearish' : 'neutral',
    bullish || bearish ? adx / 100 : 0.5,
    { adx, trend_strength: adx / 100 }
  )
  const z =
    (last(close) - last(rolling(close, 50))) / Math.sqrt(last(rolling(close, 50, x => variance(x))))
  const bb = technicalBollinger(close),
    bbRatio = (last(close) - last(bb.lower)) / (last(bb.upper) - last(bb.lower))
  const mrSignal =
    z < -2 && bbRatio < 0.2 ? 'bullish' : z > 2 && bbRatio > 0.8 ? 'bearish' : 'neutral'
  const mean_reversion = group(
    mrSignal,
    mrSignal === 'neutral' ? 0.5 : Math.min(Math.abs(z) / 4, 1),
    {
      z_score: z,
      price_vs_bb: bbRatio,
      rsi_14: last(technicalRsi(close, 14)),
      rsi_28: last(technicalRsi(close, 28))
    }
  )
  const sums = [21, 63, 126].map(w =>
    last(rolling(returns, w, xs => xs.reduce((a, b) => a + b, 0)))
  )
  const momScore = 0.4 * sums[0]! + 0.3 * sums[1]! + 0.3 * sums[2]!,
    volumeMomentum = last(volume) / last(rolling(volume, 21))
  const momSignal =
    momScore > 0.05 && volumeMomentum > 1
      ? 'bullish'
      : momScore < -0.05 && volumeMomentum > 1
        ? 'bearish'
        : 'neutral'
  const momentum = group(
    momSignal,
    momSignal === 'neutral' ? 0.5 : Math.min(Math.abs(momScore) * 5, 1),
    {
      momentum_1m: sums[0]!,
      momentum_3m: sums[1]!,
      momentum_6m: sums[2]!,
      volume_momentum: volumeMomentum
    }
  )
  const histVol = rolling(returns, 21, xs => Math.sqrt(variance(xs)) * Math.sqrt(252)),
    volMean = rolling(histVol, 63)
  const regime = last(histVol) / last(volMean),
    volZ =
      (last(histVol) - last(volMean)) / Math.sqrt(last(rolling(histVol, 63, xs => variance(xs))))
  const volSignal =
    regime < 0.8 && volZ < -1 ? 'bullish' : regime > 1.2 && volZ > 1 ? 'bearish' : 'neutral'
  const volatility = group(
    volSignal,
    volSignal === 'neutral' ? 0.5 : Math.min(Math.abs(volZ) / 3, 1),
    {
      historical_volatility: last(histVol),
      volatility_regime: regime,
      volatility_z_score: volZ,
      atr_ratio: last(technicalAtr(bars)) / last(close)
    }
  )
  const skew = last(rolling(returns, 63, xs => moment(xs, 'skew'))),
    kurt = last(rolling(returns, 63, xs => moment(xs, 'kurt'))),
    hurst = technicalHurst(close)
  const statSignal =
    hurst < 0.4 && skew > 1 ? 'bullish' : hurst < 0.4 && skew < -1 ? 'bearish' : 'neutral'
  const stat_arb = group(statSignal, statSignal === 'neutral' ? 0.5 : (0.5 - hurst) * 2, {
    hurst_exponent: hurst,
    skewness: skew,
    kurtosis: kurt
  })
  const groups: TechnicalGroups = { trend, mean_reversion, momentum, volatility, stat_arb }
  return { groups, combined: combineTechnicalSignals(groups) }
}
export const hedgeFundTechnicalsSource: StrategySource<TechnicalsInput> = {
  id: 'hedge-fund-technicals',
  upstream: 'ai-hedge-fund/src/agents/technicals.py (independent behavioral implementation)',
  run(input, context) {
    if (
      !input ||
      typeof input !== 'object' ||
      typeof input.symbol !== 'string' ||
      !input.symbol.trim() ||
      input.symbol !== input.symbol.trim() ||
      !Array.isArray(input.bars) ||
      !isUtcTime(context.evaluationTime)
    )
      throw new Error('invalid technicals input')
    if (
      input.missingVolume !== undefined &&
      (!Number.isSafeInteger(input.missingVolume) || input.missingVolume < 0)
    )
      throw new Error('invalid missingVolume count')
    if (
      input.quantity !== undefined &&
      (!Number.isSafeInteger(input.quantity) || input.quantity < 0)
    )
      throw new Error('invalid technicals quantity')
    let previous = ''
    for (const bar of input.bars) {
      if (
        !bar ||
        typeof bar !== 'object' ||
        typeof bar.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(bar.date) ||
        !Number.isFinite(Date.parse(bar.date)) ||
        new Date(bar.date).toISOString().slice(0, 10) !== bar.date ||
        bar.date <= previous ||
        Date.parse(bar.date) > Date.parse(context.evaluationTime)
      )
        throw new Error('invalid, duplicate, future or unordered technicals dates')
      for (const key of ['open', 'high', 'low', 'close', 'volume'] as const)
        if (!Number.isFinite(bar[key]) || bar[key] < 0 || (key !== 'volume' && bar[key] === 0))
          throw new Error(`invalid technicals ${key}`)
      if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close))
        throw new Error('invalid technicals OHLC')
      previous = bar.date
    }
    const refused = (input.missingVolume ?? 0) > 0 || input.bars.some(b => b.missingVolume === 1)
    const analysis = analyzeTechnicals(input.bars)
    const action =
      refused || !input.bars.length
        ? 'HOLD'
        : analysis.combined.signal === 'bullish'
          ? 'BUY'
          : analysis.combined.signal === 'bearish'
            ? 'SELL'
            : 'HOLD'
    const evidence: Record<string, number | string> = {
      score: analysis.combined.score,
      barCount: input.bars.length,
      missingVolume: input.missingVolume ?? input.bars.filter(b => b.missingVolume === 1).length
    }
    for (const [name, g] of Object.entries(analysis.groups)) {
      evidence[`${name}.signal`] = g.signal
      evidence[`${name}.confidence`] = finiteOrZero(g.confidence)
      for (const [key, value] of Object.entries(g.metrics)) evidence[`${name}.${key}`] = value
    }
    return [
      {
        sourceId: this.id,
        upstream: this.upstream,
        kind: 'recommendation',
        instrument: { type: 'equity', symbol: input.symbol },
        action,
        confidence: refused ? 0 : analysis.combined.confidence,
        asOf: context.evaluationTime,
        reasoning: refused
          ? 'Volume-dependent technical analysis refused: OpenBB volume is missing.'
          : !input.bars.length
            ? 'No bars supplied; HOLD.'
            : `Five-group technical ensemble: score ${analysis.combined.score}; strict BUY above 0.2, SELL below -0.2.`,
        ...(action === 'HOLD'
          ? {}
          : {
              sizing: {
                quantity: input.quantity ?? 1,
                limitPriceCents: last(input.bars.map(b => b.close)) * 100
              }
            }),
        evidence
      }
    ]
  }
}
