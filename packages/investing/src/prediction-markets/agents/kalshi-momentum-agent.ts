import type { TradeSignal } from "../../trading-agents/types/index.js";
import type {
  KalshiMomentumAgentRequest,
  KalshiMomentumAgentResult,
  KalshiMomentumAgentStep,
  KalshiMomentumStrategyState,
  PaperPortfolioState,
  PredictionMarketTradeIntent,
} from "../types.js";
import { InMemoryPaperExecutor } from "../execution/paper.js";
import {
  applyMomentumExecution,
  createKalshiMomentumState,
  evaluateKalshiMomentumTick,
  normalizeKalshiMomentumConfig,
  validateKalshiMomentumState,
} from "../strategies/kalshi-momentum.js";
import { validateKalshiMarketTick } from "../validation.js";

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function reviewedIntent(intent: PredictionMarketTradeIntent, signal?: TradeSignal): PredictionMarketTradeIntent {
  if (!signal) return intent;
  if (
    !["BUY", "SELL", "HOLD"].includes(signal.action) ||
    !Number.isFinite(signal.confidence) || signal.confidence < 0 || signal.confidence > 1 ||
    !(signal.timestamp instanceof Date) || !Number.isFinite(signal.timestamp.getTime()) ||
    typeof signal.reasoning !== "string"
  ) {
    throw new Error("Research review returned an invalid TradeSignal");
  }
  if (signal.action === intent.action) return intent;
  return {
    ...intent,
    action: "HOLD",
    outcome: null,
    quantity: 0,
    reason: `Research review vetoed ${intent.action} ${intent.outcome}: ${signal.reasoning}`,
  };
}

// Both entry points drive the same replay, so reviewing an intent cannot execute it twice.
function* replay(
  request: KalshiMomentumAgentRequest,
): Generator<
  { intent: PredictionMarketTradeIntent; portfolio: PaperPortfolioState },
  KalshiMomentumAgentResult,
  TradeSignal | undefined
> {
  if (!Array.isArray(request.ticks) || request.ticks.length === 0) {
    throw new Error("At least one recorded market tick is required");
  }
  const config = normalizeKalshiMomentumConfig(request.config);
  const initialState = request.initialStrategyState ?? createKalshiMomentumState();
  validateKalshiMomentumState(initialState, config);
  let strategyState: KalshiMomentumStrategyState = {
    ...initialState,
    directions: [...initialState.directions],
    position: initialState.position ? { ...initialState.position } : undefined,
  };
  let previousTime = strategyState.lastTimestamp ? Date.parse(strategyState.lastTimestamp) : -Infinity;
  for (const tick of request.ticks) {
    validateKalshiMarketTick(tick);
    if (tick.ticker !== request.ticks[0].ticker || (strategyState.ticker && tick.ticker !== strategyState.ticker)) {
      throw new Error("A momentum replay must contain ticks for exactly one market");
    }
    if (Date.parse(tick.timestamp) <= previousTime) {
      throw new Error("Market ticks must have strictly increasing timestamps");
    }
    previousTime = Date.parse(tick.timestamp);
  }
  const initialCashCents = request.initialCashCents ?? request.initialPortfolio?.initialCashCents ?? 10_000;
  if (request.initialPortfolio && initialCashCents !== request.initialPortfolio.initialCashCents) {
    throw new Error("initialCashCents must match the resumed portfolio");
  }
  const executor = new InMemoryPaperExecutor({
    initialCashCents,
    maxPositionPerMarket: config.maxPosition,
    initialPortfolio: request.initialPortfolio,
  });
  const positions = Object.values(executor.snapshot().positions);
  const position = strategyState.position;
  if (
    positions.length !== (position ? 1 : 0) ||
    (position && (
      position.ticker !== request.ticks[0].ticker ||
      positions[0].ticker !== position.ticker || positions[0].outcome !== position.outcome ||
      positions[0].quantity !== position.quantity || positions[0].averageEntryPriceCents !== position.entryPriceCents
    ))
  ) {
    throw new Error("Initial strategy position must match the paper portfolio");
  }
  const steps: KalshiMomentumAgentStep[] = [];
  for (const tick of request.ticks) {
    executor.mark(tick);
    const decision = evaluateKalshiMomentumTick(tick, strategyState, config);
    const signal = yield { intent: decision.intent, portfolio: executor.snapshot() };
    const execution = executor.execute(reviewedIntent(decision.intent, signal));
    strategyState = applyMomentumExecution(decision.state, execution);
    steps.push({
      tick: { ...tick },
      intent: decision.intent,
      ...(signal ? { researchSignal: { ...signal, timestamp: new Date(signal.timestamp) } } : {}),
      execution,
      strategyState: {
        ...strategyState,
        directions: [...strategyState.directions],
        position: strategyState.position ? { ...strategyState.position } : undefined,
      },
    });
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

/** Replay recorded ticks through momentum logic and paper execution without model review. */
export function runKalshiMomentumPaperAgent(request: KalshiMomentumAgentRequest): KalshiMomentumAgentResult {
  const iterator = replay(request);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  return step.value;
}

/** Review actionable intents through investing research before the same paper executor. */
export async function runKalshiMomentumPaperAgentWithResearch(
  request: KalshiMomentumAgentRequest,
  review: (intent: PredictionMarketTradeIntent, portfolio: PaperPortfolioState) => Promise<TradeSignal>,
): Promise<KalshiMomentumAgentResult> {
  const iterator = replay(request);
  let step = iterator.next();
  while (!step.done) {
    const { intent, portfolio } = step.value;
    const signal = intent.action === "HOLD" ? undefined : await review({ ...intent }, portfolio);
    if (intent.action !== "HOLD" && !signal) throw new Error("Research review must return a TradeSignal");
    step = iterator.next(signal);
  }
  return step.value;
}
