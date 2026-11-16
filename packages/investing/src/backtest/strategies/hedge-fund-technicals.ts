/**
 * Technical-analyst ensemble, ported from
 * `third-party-trading-bots/ai-hedge-fund/src/agents/technicals.py`
 * (virattt/ai-hedge-fund, MIT License).
 *
 * Five sub-strategies (trend, mean reversion, momentum, volatility,
 * statistical arbitrage) each vote bullish, bearish or neutral with a
 * confidence; the votes are combined with the upstream weights. Indicator
 * definitions follow the pandas originals: rolling standard deviations are
 * sample (ddof=1), the trend EMAs use `adjust=False`, ADX uses `ewm(span)`
 * with pandas' default `adjust=True`, and skew is pandas' bias-corrected
 * rolling skew. The upstream RSI and ATR values are reported as metrics only
 * and do not affect the decision, so they are not ported. The Hurst exponent
 * reproduces upstream's effective value of 0 (see UPSTREAM_HURST), so daily
 * actions match the Python agent exactly on the recorded fixtures.
 */
import type { BacktestStrategy } from "../strategy";
import type { Action, Bar } from "../types";

export type Vote = "bullish" | "neutral" | "bearish";
export interface Part {
  signal: Vote;
  confidence: number;
}
export type PartName = "trend" | "mean_reversion" | "momentum" | "volatility" | "stat_arb";

export const STRATEGY_WEIGHTS: Record<PartName, number> = {
  trend: 0.25,
  mean_reversion: 0.2,
  momentum: 0.25,
  volatility: 0.15,
  stat_arb: 0.15,
};

/** Fewest bars before every sub-strategy has data: 126 daily returns. */
export const MIN_BARS = 127;

const VOTE_VALUE: Record<Vote, number> = { bullish: 1, neutral: 0, bearish: -1 };

/** Upstream `weighted_signal_combination`, with its 0.2 cut-off as `threshold`. */
export function combineSignals(parts: Record<PartName, Part>, threshold = 0.2): Part {
  let weighted = 0;
  let total = 0;
  for (const name of Object.keys(STRATEGY_WEIGHTS) as PartName[]) {
    const { signal, confidence } = parts[name];
    weighted += VOTE_VALUE[signal] * STRATEGY_WEIGHTS[name] * confidence;
    total += STRATEGY_WEIGHTS[name] * confidence;
  }
  const score = total > 0 ? weighted / total : 0;
  const signal: Vote = score > threshold ? "bullish" : score < -threshold ? "bearish" : "neutral";
  return { signal, confidence: Math.abs(score) };
}

// ---- pandas-equivalent series helpers (NaN where pandas gives NaN) ----

function rolling(values: number[], window: number, fn: (w: number[]) => number): number[] {
  return values.map((_, i) => {
    if (i + 1 < window) return NaN;
    const w = values.slice(i + 1 - window, i + 1);
    return w.some((v) => !Number.isFinite(v)) ? NaN : fn(w);
  });
}
const mean = (w: number[]) => w.reduce((a, b) => a + b, 0) / w.length;
const sampleStd = (w: number[]) => {
  const m = mean(w);
  return Math.sqrt(w.reduce((a, v) => a + (v - m) ** 2, 0) / (w.length - 1));
};
const sum = (w: number[]) => w.reduce((a, b) => a + b, 0);
/** pandas rolling skew: bias-corrected Fisher-Pearson coefficient. */
const sampleSkew = (w: number[]) => {
  const n = w.length;
  const m = mean(w);
  const m2 = w.reduce((a, v) => a + (v - m) ** 2, 0) / n;
  const m3 = w.reduce((a, v) => a + (v - m) ** 3, 0) / n;
  if (!(m2 > 0)) return NaN;
  return (Math.sqrt(n * (n - 1)) / (n - 2)) * (m3 / m2 ** 1.5);
};

/** `ewm(span, adjust=False).mean()` */
function emaNoAdjust(values: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : alpha * v + (1 - alpha) * out[i - 1]));
  return out;
}

/** `ewm(span).mean()` with pandas defaults (adjust=True, ignore_na=False). */
function emaAdjusted(values: number[], span: number): number[] {
  const decay = 1 - 2 / (span + 1);
  let num = 0;
  let den = 0;
  return values.map((v) => {
    const valid = Number.isFinite(v);
    num = num * decay + (valid ? v : 0);
    den = den * decay + (valid ? 1 : 0);
    return den > 0 ? num / den : NaN;
  });
}

function pctChange(values: number[]): number[] {
  return values.map((v, i) => (i === 0 ? NaN : v / values[i - 1] - 1));
}

function adx(bars: Bar[], period = 14): number[] {
  const tr = bars.map((b, i) =>
    i === 0
      ? b.high - b.low
      : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
  );
  const plusDm = bars.map((b, i) => {
    if (i === 0) return 0;
    const up = b.high - bars[i - 1].high;
    const down = bars[i - 1].low - b.low;
    return up > down && up > 0 ? up : 0;
  });
  const minusDm = bars.map((b, i) => {
    if (i === 0) return 0;
    const up = b.high - bars[i - 1].high;
    const down = bars[i - 1].low - b.low;
    return down > up && down > 0 ? down : 0;
  });
  const trE = emaAdjusted(tr, period);
  const plusDi = emaAdjusted(plusDm, period).map((v, i) => (100 * v) / trE[i]);
  const minusDi = emaAdjusted(minusDm, period).map((v, i) => (100 * v) / trE[i]);
  const dx = plusDi.map((p, i) => (100 * Math.abs(p - minusDi[i])) / (p + minusDi[i]));
  return emaAdjusted(dx, period);
}

/**
 * The Hurst exponent upstream's agent actually uses: 0.
 *
 * Upstream `calculate_hurst_exponent` receives a pandas Series and computes
 * `np.subtract(price_series[lag:], price_series[:-lag])`. pandas aligns the
 * two slices on their date index, so every difference is x_t − x_t = 0, tau
 * is the 1e-8 floor at every lag, and the fitted slope is 0 (about 4.7e-16).
 * The stat-arb vote therefore always passes its `hurst < 0.4` test. This port
 * keeps that behaviour so backtests reproduce the bot as it runs; the daily
 * actions are checked against upstream output in the test suite.
 */
const UPSTREAM_HURST = 0;

/** Indicator series computed once; every value at index i uses bars 0..i only. */
function indicatorSeries(bars: Bar[]) {
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume);
  const returns = pctChange(close);
  const histVol = rolling(returns, 21, sampleStd).map((v) => v * Math.sqrt(252));
  const volMa = rolling(histVol, 63, mean);
  return {
    close,
    ema8: emaNoAdjust(close, 8),
    ema21: emaNoAdjust(close, 21),
    ema55: emaNoAdjust(close, 55),
    adx: adx(bars),
    ma50: rolling(close, 50, mean),
    std50: rolling(close, 50, sampleStd),
    sma20: rolling(close, 20, mean),
    std20: rolling(close, 20, sampleStd),
    mom1m: rolling(returns, 21, sum),
    mom3m: rolling(returns, 63, sum),
    mom6m: rolling(returns, 126, sum),
    volumeMa: rolling(volume, 21, mean),
    volume,
    histVol,
    volMa,
    volStd: rolling(histVol, 63, sampleStd),
    skew: rolling(returns, 63, sampleSkew),
  };
}

type Series = ReturnType<typeof indicatorSeries>;

function partsAt(s: Series, i: number): Record<PartName, Part> {
  const neutral: Part = { signal: "neutral", confidence: 0.5 };

  // Trend: EMA 8/21/55 alignment, confidence = ADX / 100.
  const short = s.ema8[i] > s.ema21[i];
  const medium = s.ema21[i] > s.ema55[i];
  const strength = s.adx[i] / 100;
  const trend: Part = short && medium
    ? { signal: "bullish", confidence: strength }
    : !short && !medium
      ? { signal: "bearish", confidence: strength }
      : neutral;

  // Mean reversion: 50-day z-score and position within 20-day Bollinger Bands.
  const z = (s.close[i] - s.ma50[i]) / s.std50[i];
  const upper = s.sma20[i] + 2 * s.std20[i];
  const lower = s.sma20[i] - 2 * s.std20[i];
  const bb = (s.close[i] - lower) / (upper - lower);
  const meanReversion: Part = z < -2 && bb < 0.2
    ? { signal: "bullish", confidence: Math.min(Math.abs(z) / 4, 1) }
    : z > 2 && bb > 0.8
      ? { signal: "bearish", confidence: Math.min(Math.abs(z) / 4, 1) }
      : neutral;

  // Momentum: weighted 1/3/6-month return sums, confirmed by above-average volume.
  const score = 0.4 * s.mom1m[i] + 0.3 * s.mom3m[i] + 0.3 * s.mom6m[i];
  const volumeConfirmed = s.volume[i] / s.volumeMa[i] > 1;
  const momentum: Part = score > 0.05 && volumeConfirmed
    ? { signal: "bullish", confidence: Math.min(Math.abs(score) * 5, 1) }
    : score < -0.05 && volumeConfirmed
      ? { signal: "bearish", confidence: Math.min(Math.abs(score) * 5, 1) }
      : neutral;

  // Volatility: regime versus its 63-day average and z-score.
  const regime = s.histVol[i] / s.volMa[i];
  const volZ = (s.histVol[i] - s.volMa[i]) / s.volStd[i];
  const volatility: Part = regime < 0.8 && volZ < -1
    ? { signal: "bullish", confidence: Math.min(Math.abs(volZ) / 3, 1) }
    : regime > 1.2 && volZ > 1
      ? { signal: "bearish", confidence: Math.min(Math.abs(volZ) / 3, 1) }
      : neutral;

  // Statistical arbitrage: mean-reverting (Hurst < 0.4) with skewed returns.
  // Upstream's Hurst is always 0; see UPSTREAM_HURST.
  const h = UPSTREAM_HURST;
  const statArb: Part = h < 0.4 && s.skew[i] > 1
    ? { signal: "bullish", confidence: (0.5 - h) * 2 }
    : h < 0.4 && s.skew[i] < -1
      ? { signal: "bearish", confidence: (0.5 - h) * 2 }
      : neutral;

  return { trend, mean_reversion: meanReversion, momentum, volatility, stat_arb: statArb };
}

/** The upstream agent's verdict on the last bar of `bars`. */
export function evaluateTechnicals(bars: Bar[], threshold = 0.2): Part & { parts: Record<PartName, Part> } {
  if (bars.length < MIN_BARS) throw new Error(`hedge-fund technicals needs at least ${MIN_BARS} bars`);
  const parts = partsAt(indicatorSeries(bars), bars.length - 1);
  return { ...combineSignals(parts, threshold), parts };
}

export const hedgeFundTechnicals: BacktestStrategy = {
  id: "hedge-fund-technicals",
  name: "Hedge-fund technicals",
  description:
    "Port of ai-hedge-fund's technical analyst: trend, mean-reversion, momentum, volatility and " +
    "statistical-arbitrage votes combined by weight. Buys on a bullish verdict, sells on a bearish one.",
  provider: "third-party",
  source: { repo: "ai-hedge-fund", file: "src/agents/technicals.py", license: "MIT" },
  assetClasses: ["equity"],
  minBars: MIN_BARS,
  params: [{ id: "threshold", label: "Signal threshold", default: 0.2, min: 0.05, max: 0.6, step: 0.05 }],
  signals(bars, params) {
    const threshold = params.threshold ?? 0.2;
    const series = indicatorSeries(bars);
    return bars.map((_, i): Action => {
      if (i + 1 < MIN_BARS) return 0;
      const { signal } = combineSignals(partsAt(series, i), threshold);
      return signal === "bullish" ? 1 : signal === "bearish" ? -1 : 0;
    });
  },
};
