import type {
  KalshiMomentumAgentRequest,
  KalshiMomentumAgentResult,
  KalshiMomentumAgentStep,
} from "../types.js";
import { InMemoryPaperExecutor } from "../execution/paper.js";
import {
  applyMomentumExecution,
  createKalshiMomentumState,
  evaluateKalshiMomentumTick,
  normalizeKalshiMomentumConfig,
} from "../strategies/kalshi-momentum.js";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Replay recorded Kalshi ticks through momentum logic and paper execution. */
export function runKalshiMomentumPaperAgent(
  request: KalshiMomentumAgentRequest,
): KalshiMomentumAgentResult {
  if (!Array.isArray(request.ticks) || request.ticks.length === 0) {
    throw new Error("At least one recorded market tick is required");
  }
  const ticker = request.ticks[0].ticker;
  if (request.ticks.some((tick) => tick.ticker !== ticker)) {
    throw new Error("A momentum replay must contain ticks for exactly one market");
  }
  const config = normalizeKalshiMomentumConfig(request.config);
  const initialCashCents = request.initialCashCents ?? 10_000;
  const executor = new InMemoryPaperExecutor({
    initialCashCents,
    maxPositionPerMarket: config.maxPosition,
    initialPortfolio: request.initialPortfolio,
  });
  let strategyState = request.initialStrategyState
    ? {
        ...request.initialStrategyState,
        directions: [...request.initialStrategyState.directions],
        position: request.initialStrategyState.position
          ? { ...request.initialStrategyState.position }
          : undefined,
      }
    : createKalshiMomentumState();
  const steps: KalshiMomentumAgentStep[] = [];

  for (const tick of request.ticks) {
    executor.mark(tick);
    const decision = evaluateKalshiMomentumTick(tick, strategyState, config);
    const execution = executor.execute(decision.intent);
    strategyState = applyMomentumExecution(decision.state, execution);
    steps.push({ tick: { ...tick }, intent: decision.intent, execution, strategyState: {
      ...strategyState,
      directions: [...strategyState.directions],
      position: strategyState.position ? { ...strategyState.position } : undefined,
    } });
  }

  const portfolio = executor.snapshot();
  const filled = steps.filter((step) => step.execution.status === "FILLED").length;
  const rejected = steps.filter((step) => step.execution.status === "REJECTED").length;
  const openPosition = strategyState.position
    ? `${strategyState.position.quantity} ${strategyState.position.outcome} on ${strategyState.position.ticker}`
    : "none";
  const report = [
    "Kalshi momentum paper replay",
    `Ticks processed: ${steps.length}`,
    `Paper fills: ${filled}; rejected: ${rejected}`,
    `Open position: ${openPosition}`,
    `Cash: ${dollars(portfolio.cashCents)}`,
    `Realized P&L: ${dollars(portfolio.realizedPnlCents)}`,
    `Unrealized P&L: ${dollars(portfolio.unrealizedPnlCents)}`,
    `Equity: ${dollars(portfolio.equityCents)}`,
  ].join("\n");

  return { mode: "paper", config, steps, strategyState, portfolio, report };
}
