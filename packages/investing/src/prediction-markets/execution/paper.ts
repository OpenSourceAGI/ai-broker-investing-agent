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
    if (!Number.isInteger(config.initialCashCents) || config.initialCashCents < 0) {
      throw new Error("initialCashCents must be a non-negative integer");
    }
    if (!Number.isInteger(config.maxPositionPerMarket) || config.maxPositionPerMarket <= 0) {
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
    this.revalue();
  }

  mark(tick: KalshiMarketTick): PaperPortfolioState {
    for (const outcome of ["YES", "NO"] as const) {
      const position = this.state.positions[positionKey(tick.ticker, outcome)];
      if (position) position.markPriceCents = outcome === "YES" ? tick.yesPriceCents : 100 - tick.yesPriceCents;
    }
    this.revalue();
    return this.snapshot();
  }

  execute(intent: PredictionMarketTradeIntent): PaperExecutionResult {
    if (intent.action === "HOLD") {
      return { status: "SKIPPED", intent, reason: intent.reason, portfolio: this.snapshot() };
    }
    if (!intent.outcome || !Number.isInteger(intent.quantity) || intent.quantity <= 0) {
      return this.reject(intent, "Executable intents require an outcome and positive integer quantity");
    }
    if (!Number.isInteger(intent.priceCents) || intent.priceCents < 0 || intent.priceCents > 100) {
      return this.reject(intent, "priceCents must be an integer from 0 through 100");
    }
    const key = positionKey(intent.ticker, intent.outcome);
    const existing = this.state.positions[key];

    if (intent.action === "BUY") {
      const nextQuantity = (existing?.quantity ?? 0) + intent.quantity;
      if (nextQuantity > this.maxPositionPerMarket) return this.reject(intent, "Position limit exceeded");
      const cost = intent.priceCents * intent.quantity;
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
    const realized = (intent.priceCents - existing.averageEntryPriceCents) * intent.quantity;
    existing.quantity -= intent.quantity;
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
