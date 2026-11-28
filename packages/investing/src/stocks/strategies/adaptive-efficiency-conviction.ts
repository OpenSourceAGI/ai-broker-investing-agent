/**
 * Adaptive Efficiency & Volatility-Normalized Conviction Index (AEVCI).
 *
 * A novel causal technical indicator and long-only strategy that scales
 * volatility-normalized price drift by directional path efficiency, then
 * adapts its smoothing speed to the current market regime:
 *
 *   1. Efficiency Ratio (ER_t in [0, 1]) over `period` bars:
 *        ER_t = |C_t - C_{t-N}| / sum_{i=t-N+1..t} |C_i - C_{i-1}|
 *   2. Volatility-Normalized Drift (Z_t):
 *        Z_t = (C_t - EMA_N(C_t)) / ATR_N(t)
 *   3. Adaptive Conviction (S_t):
 *        alpha_t = alphaFast * ER_t + alphaSlow * (1 - ER_t)
 *        S_t     = alpha_t * (ER_t * Z_t) + (1 - alpha_t) * S_{t-1}
 *
 * Entry / Exit (strictly causal, zero look-ahead):
 *   - BUY  when flat, S_t crosses above `entryThreshold` (+0.35), and ER_t >= `minEfficiency` (0.30).
 *   - SELL when long and either S_t crosses below `exitThreshold` (-0.10)
 *          or close drops below `peakClose - trailingAtrMult * ATR_t`.
 */

import type { TradeSignal } from "../../trading-agents/types";
import type { HistoricalQuote } from "../quote-cache-service";

export interface AevciConfig {
  /** Lookback window for Efficiency Ratio, EMA baseline, and ATR (default: 14). */
  period: number;
  /** Fast adaptive smoothing factor in trending regimes (default: 0.45). */
  fastAlpha: number;
  /** Slow adaptive smoothing factor in choppy regimes (default: 0.08). */
  slowAlpha: number;
  /** Minimum directional efficiency required to enter a long trade (default: 0.30). */
  minEfficiency: number;
  /** Conviction threshold above which a BUY signal fires (default: 0.35). */
  entryThreshold: number;
  /** Conviction threshold below which a momentum exit fires (default: -0.10). */
  exitThreshold: number;
  /** ATR multiple for the volatility-adjusted trailing stop (default: 2.5). */
  trailingAtrMult: number;
  /** Minimum bars observed before any actionable BUY/SELL is emitted. */
  warmupBars: number;
}

export const DEFAULT_AEVCI_CONFIG: AevciConfig = {
  period: 14,
  fastAlpha: 0.45,
  slowAlpha: 0.08,
  minEfficiency: 0.30,
  entryThreshold: 0.35,
  exitThreshold: -0.10,
  trailingAtrMult: 2.5,
  warmupBars: 20,
};

export type AevciBar = Pick<HistoricalQuote, "date" | "close" | "high" | "low">;

export interface AevciPoint {
  date: string;
  efficiency: number;
  atr: number;
  rawConviction: number;
  conviction: number;
}

export function normalizeAevciConfig(config: Partial<AevciConfig> = {}): AevciConfig {
  const period = Number.isInteger(config.period) && (config.period ?? 0) >= 2
    ? (config.period as number)
    : DEFAULT_AEVCI_CONFIG.period;
  const fastAlpha = typeof config.fastAlpha === "number" && config.fastAlpha > 0 && config.fastAlpha <= 1
    ? config.fastAlpha
    : DEFAULT_AEVCI_CONFIG.fastAlpha;
  const slowAlpha = typeof config.slowAlpha === "number" && config.slowAlpha > 0 && config.slowAlpha <= fastAlpha
    ? config.slowAlpha
    : Math.min(DEFAULT_AEVCI_CONFIG.slowAlpha, fastAlpha);
  const minEfficiency = typeof config.minEfficiency === "number" && config.minEfficiency >= 0 && config.minEfficiency <= 1
    ? config.minEfficiency
    : DEFAULT_AEVCI_CONFIG.minEfficiency;
  const entryThreshold = typeof config.entryThreshold === "number" && Number.isFinite(config.entryThreshold)
    ? config.entryThreshold
    : DEFAULT_AEVCI_CONFIG.entryThreshold;
  const exitThreshold = typeof config.exitThreshold === "number" && Number.isFinite(config.exitThreshold)
    ? config.exitThreshold
    : DEFAULT_AEVCI_CONFIG.exitThreshold;
  const trailingAtrMult = typeof config.trailingAtrMult === "number" && config.trailingAtrMult > 0
    ? config.trailingAtrMult
    : DEFAULT_AEVCI_CONFIG.trailingAtrMult;
  const warmupBars = Number.isInteger(config.warmupBars) && (config.warmupBars ?? 0) >= period
    ? (config.warmupBars as number)
    : Math.max(DEFAULT_AEVCI_CONFIG.warmupBars, period);

  return {
    period,
    fastAlpha,
    slowAlpha,
    minEfficiency,
    entryThreshold,
    exitThreshold,
    trailingAtrMult,
    warmupBars,
  };
}

/** Computes the causal AEVCI indicator series over chronological OHLC bars. */
export function computeAevciSeries(
  bars: readonly AevciBar[],
  config: Partial<AevciConfig> = {},
): AevciPoint[] {
  if (bars.length === 0) return [];
  const cfg = normalizeAevciConfig(config);
  const eps = 1e-9;
  const emaAlpha = 2 / (cfg.period + 1);

  let ema = bars[0].close;
  let atr = Math.max(eps, bars[0].high - bars[0].low);
  let smoothedConviction = 0;

  const points: AevciPoint[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    if (!Number.isFinite(bar.close) || !Number.isFinite(bar.high) || !Number.isFinite(bar.low)) {
      throw new Error(`Invalid bar price at index ${i}`);
    }

    if (i > 0) {
      const prevClose = bars[i - 1].close;
      const tr = Math.max(
        bar.high - bar.low,
        Math.abs(bar.high - prevClose),
        Math.abs(bar.low - prevClose),
      );
      ema = emaAlpha * bar.close + (1 - emaAlpha) * ema;
      atr = ((cfg.period - 1) * atr + tr) / cfg.period;
    }

    let efficiency = 0;
    if (i >= cfg.period) {
      const netMove = Math.abs(bar.close - bars[i - cfg.period].close);
      let pathLength = 0;
      for (let j = i - cfg.period + 1; j <= i; j++) {
        pathLength += Math.abs(bars[j].close - bars[j - 1].close);
      }
      efficiency = pathLength > eps ? Math.min(1, netMove / pathLength) : 0;
    }

    const zDrift = (bar.close - ema) / Math.max(eps, atr);
    const rawConviction = efficiency * zDrift;
    const adaptiveAlpha = cfg.fastAlpha * efficiency + cfg.slowAlpha * (1 - efficiency);
    smoothedConviction = adaptiveAlpha * rawConviction + (1 - adaptiveAlpha) * smoothedConviction;

    points.push({
      date: bar.date,
      efficiency,
      atr,
      rawConviction,
      conviction: smoothedConviction,
    });
  }

  return points;
}

/** Evaluates AEVCI over OHLC bars and emits deterministic `TradeSignal`s. */
export function evaluateAevciStrategy(
  bars: readonly AevciBar[],
  config: Partial<AevciConfig> = {},
): TradeSignal[] {
  if (bars.length === 0) return [];
  const cfg = normalizeAevciConfig(config);
  const series = computeAevciSeries(bars, cfg);

  const signals: TradeSignal[] = [];
  let inPosition = false;
  let peakClose = 0;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const point = series[i];
    const prevConviction = i > 0 ? series[i - 1].conviction : 0;

    if (i + 1 < cfg.warmupBars) {
      signals.push({
        action: "HOLD",
        confidence: 0,
        reasoning: `AEVCI warmup (${i + 1}/${cfg.warmupBars} bars)`,
      });
      continue;
    }

    if (!inPosition) {
      const crossedAbove = prevConviction <= cfg.entryThreshold && point.conviction > cfg.entryThreshold;
      if (crossedAbove && point.efficiency >= cfg.minEfficiency) {
        inPosition = true;
        peakClose = bar.close;
        const confidence = Math.min(0.95, Math.max(0.5, 0.5 + 0.45 * point.efficiency));
        signals.push({
          action: "BUY",
          confidence,
          reasoning: `AEVCI breakout: conviction ${point.conviction.toFixed(2)} > ${cfg.entryThreshold} with efficiency ${(point.efficiency * 100).toFixed(0)}%`,
        });
        continue;
      }
    } else {
      peakClose = Math.max(peakClose, bar.close);
      const stopLevel = peakClose - cfg.trailingAtrMult * point.atr;
      const crossedBelow = prevConviction >= cfg.exitThreshold && point.conviction < cfg.exitThreshold;
      const stoppedOut = bar.close < stopLevel;

      if (crossedBelow || stoppedOut) {
        inPosition = false;
        peakClose = 0;
        signals.push({
          action: "SELL",
          confidence: stoppedOut ? 0.85 : 0.7,
          reasoning: stoppedOut
            ? `AEVCI trailing ATR stop triggered (${bar.close.toFixed(2)} < ${stopLevel.toFixed(2)})`
            : `AEVCI momentum reversal: conviction ${point.conviction.toFixed(2)} < ${cfg.exitThreshold}`,
        });
        continue;
      }
    }

    signals.push({
      action: "HOLD",
      confidence: 0.5,
      reasoning: `AEVCI neutral (conviction ${point.conviction.toFixed(2)}, efficiency ${(point.efficiency * 100).toFixed(0)}%)`,
    });
  }

  return signals;
}
