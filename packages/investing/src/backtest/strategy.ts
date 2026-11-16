import type { Action, AssetClass, Bar } from "./types";

/** A numeric setting a user can tune before a backtest. */
export interface StrategyParam {
  id: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

/**
 * A strategy the backtest engine can run. Built-in indicator strategies and
 * strategies ported from `third-party-trading-bots/` share this shape.
 */
export interface BacktestStrategy {
  id: string;
  name: string;
  description: string;
  provider: "builtin" | "third-party";
  /** Where a third-party strategy was ported from. */
  source?: { repo: string; file: string; license: string };
  assetClasses: AssetClass[];
  /** Fewest bars the strategy needs before it can produce a signal. */
  minBars: number;
  params: StrategyParam[];
  /** Why the strategy cannot run on other asset classes, shown to users. */
  unsupportedReason?: string;
  /** One action per bar. Bar i may only use bars 0..i. */
  signals(bars: Bar[], params: Record<string, number>): Action[];
}

export type UnavailableReason = "unsupported-asset" | "insufficient-history" | "unknown-strategy";

export type Availability =
  | { available: true }
  | { available: false; reason: UnavailableReason; message: string };

/**
 * Whether `strategy` can run for the given asset class and, when known, the
 * number of bars in the selected range.
 */
export function checkAvailability(
  strategy: BacktestStrategy,
  ctx: { assetClass: AssetClass; barCount?: number },
): Availability {
  if (!strategy.assetClasses.includes(ctx.assetClass)) {
    return {
      available: false,
      reason: "unsupported-asset",
      message:
        strategy.unsupportedReason ??
        `Supports ${strategy.assetClasses.join(", ")} assets only, not ${ctx.assetClass}.`,
    };
  }
  if (ctx.barCount !== undefined && ctx.barCount < strategy.minBars) {
    return {
      available: false,
      reason: "insufficient-history",
      message: `Needs at least ${strategy.minBars} daily bars; the selected range has ${ctx.barCount}.`,
    };
  }
  return { available: true };
}

/** Defaults for every declared param, with finite overrides clamped to range. */
export function resolveParams(
  strategy: BacktestStrategy,
  overrides: Record<string, number> = {},
): Record<string, number> {
  const resolved: Record<string, number> = {};
  for (const param of strategy.params) {
    const value = overrides[param.id];
    resolved[param.id] =
      typeof value === "number" && Number.isFinite(value)
        ? Math.min(param.max, Math.max(param.min, value))
        : param.default;
  }
  return resolved;
}
