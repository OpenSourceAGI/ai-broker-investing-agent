import { validateKalshiMarketTick, validateMarketObservation, validatePriceCents } from "../validation.js";

import type {
  KalshiMarketTick,
  PaperExecutionResult,
  PaperPortfolioState,
  PaperPosition,
  PredictionMarketOutcome,
  PredictionMarketTradeIntent,
} from "../types.js";

export interface InMemoryPaperExecutorConfig {
  initialCashCents: number;
  maxPositionPerMarket: number;
  initialPortfolio?: PaperPortfolioState;
}

function positionKey(ticker: string, outcome: PredictionMarketOutcome): string {
  return `${ticker}:${outcome}`;
}

function clonePortfolio(state: PaperPortfolioState): PaperPortfolioState {
  if (!state.positions || typeof state.positions !== "object" || Array.isArray(state.positions)) {
    throw new Error("Initial paper portfolio positions must be a position map");
  }
  return {
    ...state,
    positions: Object.fromEntries(
      Object.entries(state.positions).map(([key, position]) => [key, { ...position }]),
    ),
  };
}

/** Deterministic, credential-free executor. It has no network or venue client. */
export class InMemoryPaperExecutor {
  private state: PaperPortfolioState;
  private readonly maxPositionPerMarket: number;

  constructor(config: InMemoryPaperExecutorConfig) {
    if (!Number.isSafeInteger(config.initialCashCents) || config.initialCashCents < 0) {
      throw new Error("initialCashCents must be a non-negative integer");
    }
    if (!Number.isSafeInteger(config.maxPositionPerMarket) || config.maxPositionPerMarket <= 0) {
      throw new Error("maxPositionPerMarket must be a positive integer");
    }
    this.maxPositionPerMarket = config.maxPositionPerMarket;
    this.state = config.initialPortfolio
      ? clonePortfolio(config.initialPortfolio)
      : {
          initialCashCents: config.initialCashCents,
          cashCents: config.initialCashCents,
          positions: {},
          realizedPnlCents: 0,
          unrealizedPnlCents: 0,
          equityCents: config.initialCashCents,
        };
    this.validateInitialPortfolio();
    this.revalue();
  }

  mark(tick: KalshiMarketTick): PaperPortfolioState {
    validateKalshiMarketTick(tick);
    for (const outcome of ["YES", "NO"] as const) {
      const position = this.state.positions[positionKey(tick.ticker, outcome)];
      if (position) position.markPriceCents = outcome === "YES" ? tick.yesPriceCents : 100 - tick.yesPriceCents;
    }
    this.revalue();
    return this.snapshot();
  }

  execute(intent: PredictionMarketTradeIntent): PaperExecutionResult {
    try {
      validateMarketObservation(intent.ticker, intent.timestamp);
      validatePriceCents(intent.priceCents, "priceCents");
    } catch (error) {
      return this.reject(intent, (error as Error).message);
    }
    if (intent.action !== "BUY" && intent.action !== "SELL" && intent.action !== "HOLD") {
      return this.reject(intent, "action must be BUY, SELL or HOLD");
    }
    if (intent.action === "HOLD") {
      if (intent.outcome !== null || intent.quantity !== 0) {
        return this.reject(intent, "HOLD requires a null outcome and zero quantity");
      }
      return { status: "SKIPPED", intent, reason: intent.reason, portfolio: this.snapshot() };
    }
    if ((intent.outcome !== "YES" && intent.outcome !== "NO") || !Number.isSafeInteger(intent.quantity) || intent.quantity <= 0) {
      return this.reject(intent, "Executable intents require an outcome and positive integer quantity");
    }
    const key = positionKey(intent.ticker, intent.outcome);
    const existing = this.state.positions[key];

    if (intent.action === "BUY") {
      const nextQuantity = (existing?.quantity ?? 0) + intent.quantity;
      const marketQuantity = Object.values(this.state.positions)
        .filter((position) => position.ticker === intent.ticker)
        .reduce((quantity, position) => quantity + position.quantity, 0);
      if (marketQuantity + intent.quantity > this.maxPositionPerMarket) return this.reject(intent, "Position limit exceeded");
      const cost = intent.priceCents * intent.quantity;
      if (!Number.isSafeInteger(cost)) return this.reject(intent, "Order cost exceeds safe integer cents");
      if (cost > this.state.cashCents) return this.reject(intent, "Insufficient paper cash");
      const previousCost = existing ? existing.averageEntryPriceCents * existing.quantity : 0;
      const position: PaperPosition = {
        ticker: intent.ticker,
        outcome: intent.outcome,
        quantity: nextQuantity,
        averageEntryPriceCents: (previousCost + cost) / nextQuantity,
        markPriceCents: intent.priceCents,
        unrealizedPnlCents: 0,
      };
      this.state.cashCents -= cost;
      this.state.positions[key] = position;
      this.revalue();
      return {
        status: "FILLED",
        intent,
        fill: { priceCents: intent.priceCents, quantity: intent.quantity, cashChangeCents: -cost, realizedPnlCents: 0 },
        portfolio: this.snapshot(),
      };
    }

    if (!existing || existing.quantity < intent.quantity) return this.reject(intent, "Insufficient paper position");
    const proceeds = intent.priceCents * intent.quantity;
    if (!Number.isSafeInteger(this.state.cashCents + proceeds)) {
      return this.reject(intent, "Paper cash exceeds safe integer cents");
    }
    const realized = (intent.priceCents - existing.averageEntryPriceCents) * intent.quantity;
    existing.quantity -= intent.quantity;
    existing.markPriceCents = intent.priceCents;
    this.state.cashCents += proceeds;
    this.state.realizedPnlCents += realized;
    if (existing.quantity === 0) delete this.state.positions[key];
    this.revalue();
    return {
      status: "FILLED",
      intent,
      fill: { priceCents: intent.priceCents, quantity: intent.quantity, cashChangeCents: proceeds, realizedPnlCents: realized },
      portfolio: this.snapshot(),
    };
  }

  snapshot(): PaperPortfolioState {
    return clonePortfolio(this.state);
  }

  private reject(intent: PredictionMarketTradeIntent, reason: string): PaperExecutionResult {
    return { status: "REJECTED", intent, reason, portfolio: this.snapshot() };
  }

  private validateInitialPortfolio(): void {
    const state = this.state;
    if (
      !Number.isSafeInteger(state.initialCashCents) || state.initialCashCents < 0 ||
      !Number.isSafeInteger(state.cashCents) || state.cashCents < 0 ||
      !Number.isFinite(state.realizedPnlCents)
    ) {
      throw new Error("Invalid initial paper portfolio cash or realized P&L");
    }
    const quantities = new Map<string, number>();
    for (const [key, position] of Object.entries(state.positions)) {
      if (
        typeof position.ticker !== "string" || !position.ticker.trim() ||
        position.ticker !== position.ticker.trim() ||
        (position.outcome !== "YES" && position.outcome !== "NO") ||
        key !== positionKey(position.ticker, position.outcome) ||
        !Number.isSafeInteger(position.quantity) || position.quantity <= 0 ||
        !Number.isFinite(position.averageEntryPriceCents) ||
        position.averageEntryPriceCents < 0 || position.averageEntryPriceCents > 100
      ) {
        throw new Error("Invalid initial paper position");
      }
      validatePriceCents(position.markPriceCents, "position.markPriceCents");
      const quantity = (quantities.get(position.ticker) ?? 0) + position.quantity;
      if (quantity > this.maxPositionPerMarket) throw new Error("Initial portfolio exceeds position limit");
      quantities.set(position.ticker, quantity);
    }
  }

  private revalue(): void {
    let marketValue = 0;
    let unrealized = 0;
    for (const position of Object.values(this.state.positions)) {
      position.unrealizedPnlCents = (position.markPriceCents - position.averageEntryPriceCents) * position.quantity;
      marketValue += position.markPriceCents * position.quantity;
      unrealized += position.unrealizedPnlCents;
    }
    this.state.unrealizedPnlCents = unrealized;
    this.state.equityCents = this.state.cashCents + marketValue;
  }
}
