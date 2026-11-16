import { BACKTEST_CATALOG } from "./catalog";
import { simulate } from "./simulate";
import { checkAvailability, resolveParams, type BacktestStrategy, type UnavailableReason } from "./strategy";
import type { AssetClass, BacktestMetrics, Bar, CostModel } from "./types";

export interface BacktestRequest {
  assetClass: AssetClass;
  bars: Bar[];
  initialCapital: number;
  costs: CostModel;
  /** Strategy ids to run, or "all" for the whole catalog. */
  strategyIds: string[] | "all";
  /** Param overrides keyed by strategy id. */
  params?: Record<string, Record<string, number>>;
}

/**
 * The most recent non-hold decision, in the BUY/SELL/HOLD vocabulary the
 * trading agents use, so a backtest can feed the agent pipeline directly.
 */
export interface LatestSignal {
  action: "BUY" | "SELL" | "HOLD";
  date: string | null;
}

export type StrategyRunResult =
  | { strategyId: string; name: string; status: "ok"; metrics: BacktestMetrics; latestSignal: LatestSignal }
  | { strategyId: string; name: string; status: "unavailable"; reason: UnavailableReason; message: string }
  | { strategyId: string; name: string; status: "failed"; error: string };

const STATUS_ORDER = { ok: 0, unavailable: 1, failed: 2 } as const;

/**
 * Run each requested strategy over the same bars and costs. Every requested
 * id gets exactly one result: metrics, the reason it could not run, or the
 * error it threw. One strategy failing never affects another.
 */
export function runBacktests(
  request: BacktestRequest,
  catalog: BacktestStrategy[] = BACKTEST_CATALOG,
): StrategyRunResult[] {
  const ids = request.strategyIds === "all" ? catalog.map((s) => s.id) : [...new Set(request.strategyIds)];

  const results = ids.map((id): StrategyRunResult => {
    const strategy = catalog.find((s) => s.id === id);
    if (!strategy) {
      return {
        strategyId: id,
        name: id,
        status: "unavailable",
        reason: "unknown-strategy",
        message: `No strategy with id "${id}".`,
      };
    }
    const base = { strategyId: strategy.id, name: strategy.name };
    const availability = checkAvailability(strategy, {
      assetClass: request.assetClass,
      barCount: request.bars.length,
    });
    if (!availability.available) {
      return { ...base, status: "unavailable", reason: availability.reason, message: availability.message };
    }
    try {
      const actions = strategy.signals(request.bars, resolveParams(strategy, request.params?.[strategy.id]));
      const metrics = simulate(request.bars, actions, request.initialCapital, request.costs);
      let latest = -1;
      for (let i = actions.length - 1; i >= 0 && latest < 0; i--) if (actions[i] !== 0) latest = i;
      const latestSignal: LatestSignal =
        latest < 0
          ? { action: "HOLD", date: null }
          : { action: actions[latest] === 1 ? "BUY" : "SELL", date: request.bars[latest].date };
      return { ...base, status: "ok", metrics, latestSignal };
    } catch (error) {
      return { ...base, status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
  });

  return results.sort((a, b) => {
    if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (a.status === "ok" && b.status === "ok") {
      return b.metrics.totalReturnPercent - a.metrics.totalReturnPercent;
    }
    return 0;
  });
}
