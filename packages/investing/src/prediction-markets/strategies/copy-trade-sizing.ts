/** Port of service/strategy.rs, MIT Copyright (c) 2025 HarrierOnChain.
 * Full notice and vendored blob identity are included in THIRD_PARTY_NOTICES.md. */
export interface CopyTradeSizingConfig {
  strategy: "PERCENTAGE" | "FIXED" | "ADAPTIVE";
  copySize: number;
  tradeMultiplier: number;
  minOrderSizeUsd: number;
  maxOrderSizeUsd: number;
  minWhaleShares: number;
  adaptiveThresholdUsd: number;
  adaptiveMinPercent: number;
  adaptiveMaxPercent: number;
}
export const DEFAULT_COPY_TRADE_CONFIG: CopyTradeSizingConfig = {
  strategy: "PERCENTAGE",
  copySize: 20,
  tradeMultiplier: 1,
  minOrderSizeUsd: 5,
  maxOrderSizeUsd: 500,
  minWhaleShares: 10,
  adaptiveThresholdUsd: 1000,
  adaptiveMinPercent: 5,
  adaptiveMaxPercent: 30,
};
export function normalizeCopyTradeConfig(
  config: Partial<CopyTradeSizingConfig> = {},
): CopyTradeSizingConfig {
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error("invalid copy trade config");
  const c = { ...DEFAULT_COPY_TRADE_CONFIG, ...config };
  if (
    !["PERCENTAGE", "FIXED", "ADAPTIVE"].includes(c.strategy) ||
    Object.entries(c).some(
      ([key, n]) => key !== "strategy" && (typeof n !== "number" || !Number.isFinite(n)),
    ) ||
    c.copySize < 0 ||
    c.tradeMultiplier < 0 ||
    c.minOrderSizeUsd < 0 ||
    c.maxOrderSizeUsd < c.minOrderSizeUsd ||
    c.minWhaleShares < 0 ||
    c.adaptiveMinPercent < 0 ||
    c.adaptiveMaxPercent < c.adaptiveMinPercent
  )
    throw new Error("invalid copy trade config");
  return c;
}
export interface CopySizingDecision {
  copyUsd: number;
  effectivePercent: number;
  quantity: number;
  skipped?: string;
}
export function evaluateCopyTradeSizing(
  trade: { notionalUsd: number; shares: number; priceCents: number },
  config: Partial<CopyTradeSizingConfig> = {},
): CopySizingDecision {
  const c = normalizeCopyTradeConfig(config);
  if (
    !trade ||
    typeof trade !== "object" ||
    !Number.isFinite(trade.notionalUsd) ||
    !Number.isFinite(trade.shares) ||
    trade.shares < 0 ||
    !Number.isFinite(trade.priceCents) ||
    trade.priceCents <= 0 ||
    trade.priceCents > 100
  )
    throw new Error("invalid copy trade");
  if (trade.shares < c.minWhaleShares)
    return { copyUsd: 0, effectivePercent: 0, quantity: 0, skipped: "BelowMinSharesToCopy" };
  if (trade.notionalUsd <= 0)
    return { copyUsd: 0, effectivePercent: 0, quantity: 0, skipped: "NonPositiveNotional" };
  const effectivePercent =
    c.strategy === "FIXED"
      ? 0
      : c.strategy === "PERCENTAGE"
        ? c.copySize
        : c.adaptiveThresholdUsd <= 0
          ? c.adaptiveMinPercent
          : c.adaptiveMinPercent +
            (c.adaptiveMaxPercent - c.adaptiveMinPercent) *
              Math.exp(-Math.log1p(trade.notionalUsd / c.adaptiveThresholdUsd));
  const base = c.strategy === "FIXED" ? c.copySize : (trade.notionalUsd * effectivePercent) / 100;
  const copyUsd = Math.min(base * c.tradeMultiplier, c.maxOrderSizeUsd);
  if (!Number.isFinite(copyUsd)) throw new Error("copy sizing overflow");
  if (copyUsd < c.minOrderSizeUsd)
    return { copyUsd, effectivePercent, quantity: 0, skipped: "BelowMinOrderSize" };
  const quantity = Math.floor((copyUsd * 100) / trade.priceCents);
  if (!Number.isSafeInteger(quantity)) throw new Error("copy quantity is not a safe integer");
  // Whole-contract conversion is new integration policy; never force a minimum contract.
  return {
    copyUsd,
    effectivePercent,
    quantity,
    ...(quantity === 0 ? { skipped: "BelowOneContract" } : {}),
  };
}
