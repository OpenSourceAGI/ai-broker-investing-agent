/**
 * Deterministic Kalshi momentum strategy.
 *
 * Adapted from `kalshi-bot-api/examples/momentum_bot.py`, copyright (c) 2024,
 * distributed under the MIT License (see ./kalshi-momentum.LICENSE).
 * This port extracts only the strategy rules; it does not use PyKalshi, connect to Kalshi, or place live orders.
 */

import { validateKalshiMarketTick, validateMarketObservation, validatePriceCents } from "../validation.js";

import type {
  KalshiMarketTick,
  KalshiMomentumConfig,
  KalshiMomentumStrategyState,
  PaperExecutionResult,
  PredictionMarketOutcome,
  PredictionMarketTradeIntent,
} from "../types.js";

export const DEFAULT_KALSHI_MOMENTUM_CONFIG: KalshiMomentumConfig = {
  lookback: 5,
  momentumThreshold: 3,
  positionSize: 10,
  profitTargetCents: 5,
  stopLossCents: 3,
  maxPosition: 50,
};

export function createKalshiMomentumState(): KalshiMomentumStrategyState {
  return { directions: [], tradesExecuted: 0 };
}

export function normalizeKalshiMomentumConfig(
  config: Partial<KalshiMomentumConfig> = {},
): KalshiMomentumConfig {
  const normalized = { ...DEFAULT_KALSHI_MOMENTUM_CONFIG, ...config };
  for (const [name, value] of Object.entries(normalized)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer`);
    }
  }
  if (normalized.momentumThreshold > normalized.lookback) {
    throw new Error("momentumThreshold cannot exceed lookback");
  }
  return normalized;
}

export function validateKalshiMomentumState(
  state: KalshiMomentumStrategyState,
  config: KalshiMomentumConfig,
): void {
  if (
    !Array.isArray(state.directions) || state.directions.length > config.lookback ||
    state.directions.some((direction) => direction !== -1 && direction !== 0 && direction !== 1) ||
    !Number.isSafeInteger(state.tradesExecuted) || state.tradesExecuted < 0
  ) {
    throw new Error("Invalid momentum history or trade count");
  }
  if (state.lastYesPriceCents !== undefined) {
    validatePriceCents(state.lastYesPriceCents, "state.lastYesPriceCents");
    validateMarketObservation(state.ticker!, state.lastTimestamp!);
  } else if (state.directions.length || state.ticker || state.lastTimestamp) {
    throw new Error("Momentum history requires a previous price, market and timestamp");
  }
  if (state.position) {
    const position = state.position;
    if (
      !position.ticker || (state.ticker && position.ticker !== state.ticker) ||
      (position.outcome !== "YES" && position.outcome !== "NO") ||
      !Number.isSafeInteger(position.quantity) || position.quantity <= 0 ||
      position.quantity > config.maxPosition ||
      !Number.isFinite(position.entryPriceCents) ||
      position.entryPriceCents < 0 || position.entryPriceCents > 100
    ) {
      throw new Error("Invalid momentum position");
    }
  }
}

function outcomePrice(yesPriceCents: number, outcome: PredictionMarketOutcome): number {
  return outcome === "YES" ? yesPriceCents : 100 - yesPriceCents;
}

function hold(tick: KalshiMarketTick, reason: string): PredictionMarketTradeIntent {
  return {
    action: "HOLD",
    outcome: null,
    ticker: tick.ticker,
    quantity: 0,
    priceCents: tick.yesPriceCents,
    timestamp: tick.timestamp,
    reason,
  };
}

/** Evaluate one tick without assuming that a resulting order will fill. */
export function evaluateKalshiMomentumTick(
  tick: KalshiMarketTick,
  state: KalshiMomentumStrategyState,
  config: KalshiMomentumConfig,
): { state: KalshiMomentumStrategyState; intent: PredictionMarketTradeIntent } {
  validateKalshiMarketTick(tick);
  normalizeKalshiMomentumConfig(config);
  validateKalshiMomentumState(state, config);
  if ((state.ticker && state.ticker !== tick.ticker) || (state.position && state.position.ticker !== tick.ticker)) {
    throw new Error("Momentum state cannot be reused across markets");
  }
  if (state.lastTimestamp && Date.parse(tick.timestamp) <= Date.parse(state.lastTimestamp)) {
    throw new Error("Market ticks must have strictly increasing timestamps");
  }
  const direction: -1 | 0 | 1 = state.lastYesPriceCents === undefined
    ? 0
    : tick.yesPriceCents > state.lastYesPriceCents
      ? 1
      : tick.yesPriceCents < state.lastYesPriceCents
        ? -1
        : 0;
  const directions = state.lastYesPriceCents === undefined
    ? [...state.directions]
    : [...state.directions, direction].slice(-config.lookback);
  const nextState: KalshiMomentumStrategyState = {
    ...state,
    directions,
    ticker: tick.ticker,
    lastTimestamp: tick.timestamp,
    lastYesPriceCents: tick.yesPriceCents,
    position: state.position ? { ...state.position } : undefined,
  };

  if (state.position) {
    const currentPrice = outcomePrice(tick.yesPriceCents, state.position.outcome);
    const pnlPerContract = currentPrice - state.position.entryPriceCents;
    const recent = directions.slice(-2);
    const reversed = recent.length === 2 && (
      (state.position.outcome === "YES" && recent.every((move) => move === -1)) ||
      (state.position.outcome === "NO" && recent.every((move) => move === 1))
    );
    const exitReason = pnlPerContract >= config.profitTargetCents
      ? `Profit target reached (${pnlPerContract}c per contract)`
      : pnlPerContract <= -config.stopLossCents
        ? `Stop loss reached (${pnlPerContract}c per contract)`
        : reversed
          ? "Momentum reversed"
          : null;
    if (!exitReason) return { state: nextState, intent: hold(tick, "Open position remains within exit thresholds") };
    return {
      state: nextState,
      intent: {
        action: "SELL",
        outcome: state.position.outcome,
        ticker: tick.ticker,
        quantity: state.position.quantity,
        priceCents: currentPrice,
        timestamp: tick.timestamp,
        reason: exitReason,
      },
    };
  }

  if (config.positionSize > config.maxPosition) {
    return { state: nextState, intent: hold(tick, "Configured position size exceeds the position limit") };
  }
  if (directions.length < config.momentumThreshold) {
    return { state: nextState, intent: hold(tick, "Waiting for enough price directions") };
  }
  const recent = directions.slice(-config.momentumThreshold);
  const outcome = recent.every((move) => move === 1)
    ? "YES"
    : recent.every((move) => move === -1)
      ? "NO"
      : null;
  if (!outcome) return { state: nextState, intent: hold(tick, "No consecutive momentum signal") };

  return {
    state: nextState,
    intent: {
      action: "BUY",
      outcome,
      ticker: tick.ticker,
      quantity: config.positionSize,
      priceCents: outcomePrice(tick.yesPriceCents, outcome),
      timestamp: tick.timestamp,
      reason: `${config.momentumThreshold} consecutive YES-price ${outcome === "YES" ? "increases" : "decreases"}`,
    },
  };
}

/** Apply only filled executions, keeping rejected orders out of strategy state. */
export function applyMomentumExecution(
  state: KalshiMomentumStrategyState,
  execution: PaperExecutionResult,
): KalshiMomentumStrategyState {
  if (execution.status !== "FILLED" || !execution.fill || !execution.intent.outcome) return state;
  if (execution.intent.action !== "BUY" && execution.intent.action !== "SELL") return state;
  const position = execution.portfolio.positions[`${execution.intent.ticker}:${execution.intent.outcome}`];
  return {
    ...state,
    position: position ? {
      ticker: position.ticker,
      outcome: position.outcome,
      quantity: position.quantity,
      entryPriceCents: position.averageEntryPriceCents,
    } : undefined,
    tradesExecuted: state.tradesExecuted + 1,
  };
}
