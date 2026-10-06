/** Independent weighted-vote implementation from the documented BTC fusion behavior. */
export type BtcDirection = "BULLISH" | "BEARISH";
export interface BtcProcessorSignal {
  source: string;
  direction: BtcDirection;
  confidence: number;
  strength?: 1 | 2 | 3 | 4;
  timestamp: string;
}
export interface BtcFusionConfig {
  weights: Record<string, number>;
  minSignals: number;
  minScore: number;
}
export const DEFAULT_BTC_FUSION_CONFIG: BtcFusionConfig = {
  weights: { SpikeDetection: 0.4, PriceDivergence: 0.3, SentimentAnalysis: 0.2, default: 0.1 },
  minSignals: 1,
  minScore: 50,
};
export function normalizeBtcFusionConfig(config: Partial<BtcFusionConfig> = {}): BtcFusionConfig {
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("invalid BTC fusion config");
  const c = {
    ...DEFAULT_BTC_FUSION_CONFIG,
    ...config,
    weights: { ...DEFAULT_BTC_FUSION_CONFIG.weights, ...config.weights },
  };
  if (
    (config.weights !== undefined &&
      (!config.weights || typeof config.weights !== "object" || Array.isArray(config.weights))) ||
    Object.values(c.weights).some((w) => !Number.isFinite(w) || w < 0 || w > 1) ||
    !Number.isSafeInteger(c.minSignals) ||
    c.minSignals < 1 ||
    !Number.isFinite(c.minScore) ||
    c.minScore < 0 ||
    c.minScore > 100
  )
    throw new Error("invalid BTC fusion config");
  return c;
}
export interface BtcFusion {
  direction: BtcDirection;
  score: number;
  confidence: number;
  actionable: boolean;
  bullishContribution: number;
  bearishContribution: number;
  recentCount: number;
}
export function evaluateBtcFusion(
  signals: BtcProcessorSignal[],
  evaluationTime: string,
  config: Partial<BtcFusionConfig> = {},
): BtcFusion | null {
  const c = normalizeBtcFusionConfig(config),
    now = Date.parse(evaluationTime);
  const utc = (value: unknown): value is string =>
    typeof value === "string" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
  if (!Array.isArray(signals) || !utc(evaluationTime)) throw new Error("invalid BTC fusion input");
  const seen = new Set<string>();
  let previous = -Infinity;
  const recent = signals.filter((s) => {
    if (
      !s ||
      typeof s !== "object" ||
      !["BULLISH", "BEARISH"].includes(s.direction) ||
      typeof s.source !== "string" ||
      !s.source.trim() ||
      !Number.isFinite(s.confidence) ||
      s.confidence < 0 ||
      s.confidence > 1 ||
      (s.strength !== undefined && ![1, 2, 3, 4].includes(s.strength)) ||
      !utc(s.timestamp) ||
      Date.parse(s.timestamp) > now
    )
      throw new Error("invalid BTC processor signal");
    const timestamp = Date.parse(s.timestamp),
      key = `${s.source}:${timestamp}`;
    if (timestamp < previous || seen.has(key))
      throw new Error("BTC signals must be ordered with no duplicate processor timestamps");
    previous = timestamp;
    seen.add(key);
    return now - timestamp < 5 * 60_000;
  });
  if (recent.length < c.minSignals) return null;
  let bullishContribution = 0,
    bearishContribution = 0;
  for (const s of recent) {
    const contribution =
      ((Object.hasOwn(c.weights, s.source) ? c.weights[s.source] : c.weights.default!) *
        s.confidence *
        (s.strength ?? 2)) /
      4;
    if (s.direction === "BULLISH") bullishContribution += contribution;
    else bearishContribution += contribution;
  }
  const total = bullishContribution + bearishContribution;
  if (total < 0.0001) return null;
  const direction = bullishContribution >= bearishContribution ? "BULLISH" : "BEARISH";
  const score = (Math.max(bullishContribution, bearishContribution) / total) * 100;
  if (score < c.minScore) return null;
  const confidence = recent.reduce((sum, s) => sum + s.confidence, 0) / recent.length;
  return {
    direction,
    score,
    confidence,
    actionable: score >= 60 && confidence >= 0.6,
    bullishContribution,
    bearishContribution,
    recentCount: recent.length,
  };
}
