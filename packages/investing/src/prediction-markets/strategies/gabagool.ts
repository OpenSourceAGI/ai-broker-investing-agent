/** Independent, deterministic sequential hedge policy; no upstream code translated. */
export interface GabagoolConfig {
  entryThresholdCents: number;
  maxSumAverageCents: number;
  quantityPerSide: number;
}
export const DEFAULT_GABAGOOL_CONFIG: GabagoolConfig = {
  entryThresholdCents: 49.9,
  maxSumAverageCents: 98,
  quantityPerSide: 5,
};
export function normalizeGabagoolConfig(config: Partial<GabagoolConfig> = {}): GabagoolConfig {
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("invalid gabagool config");
  const c = { ...DEFAULT_GABAGOOL_CONFIG, ...config };
  if (
    !Number.isFinite(c.entryThresholdCents) ||
    c.entryThresholdCents <= 0 ||
    c.entryThresholdCents >= 100 ||
    !Number.isFinite(c.maxSumAverageCents) ||
    c.maxSumAverageCents <= 0 ||
    c.maxSumAverageCents > 100 ||
    !Number.isSafeInteger(c.quantityPerSide) ||
    c.quantityPerSide <= 0
  )
    throw new Error("invalid gabagool config");
  return c;
}
export interface GabagoolHolding {
  quantity: number;
  averagePriceCents: number;
}
export interface GabagoolEvaluation {
  nextSide?: "YES" | "NO";
  limitPriceCents?: number;
  reason: string;
}
/** Uses filled quantities/costs, never attempted or proposed orders. */
export function evaluateGabagool(
  quotes: { yesAskCents: number; noAskCents: number },
  held: { YES: GabagoolHolding; NO: GabagoolHolding },
  config: Partial<GabagoolConfig> = {},
): GabagoolEvaluation {
  const c = normalizeGabagoolConfig(config);
  if (
    !quotes ||
    typeof quotes !== "object" ||
    !held ||
    typeof held !== "object" ||
    !held.YES ||
    !held.NO
  )
    throw new Error("invalid gabagool input");
  for (const price of [quotes.yesAskCents, quotes.noAskCents]) {
    if (!Number.isFinite(price) || price <= 0 || price > 100)
      throw new Error("invalid gabagool quote");
  }
  for (const h of [held.YES, held.NO]) {
    if (
      !Number.isSafeInteger(h.quantity) ||
      h.quantity < 0 ||
      !Number.isFinite(h.averagePriceCents) ||
      h.averagePriceCents < 0 ||
      h.averagePriceCents > 100
    )
      throw new Error("invalid gabagool holding");
    if (h.quantity > c.quantityPerSide) throw new Error("holding exceeds gabagool target");
  }
  if (held.YES.quantity === c.quantityPerSide && held.NO.quantity === c.quantityPerSide)
    return { reason: "target already held" };
  // Complete the less-filled leg before increasing an existing imbalance. Equal holdings pick the cheaper side; ties pick YES.
  const nextSide =
    held.YES.quantity < held.NO.quantity
      ? "YES"
      : held.NO.quantity < held.YES.quantity
        ? "NO"
        : quotes.yesAskCents <= quotes.noAskCents
          ? "YES"
          : "NO";
  const other = nextSide === "YES" ? held.NO : held.YES;
  const quote = nextSide === "YES" ? quotes.yesAskCents : quotes.noAskCents;
  const limit =
    other.quantity > 0 ? c.maxSumAverageCents - other.averagePriceCents : c.entryThresholdCents;
  if (quote > limit)
    return {
      reason: `waiting for ${nextSide}: quote ${quote} exceeds limit ${limit}`,
      nextSide,
      limitPriceCents: limit,
    };
  return {
    nextSide,
    limitPriceCents: quote,
    reason: `build ${nextSide} hedge leg using actual opposite average cost ${other.averagePriceCents}; maximum ${limit}`,
  };
}
