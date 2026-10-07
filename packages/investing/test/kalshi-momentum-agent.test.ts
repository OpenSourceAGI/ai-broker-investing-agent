import { describe, expect, it } from "vitest";
import {
  InMemoryPaperExecutor,
  applyMomentumExecution,
  createKalshiMomentumState,
  evaluateKalshiMomentumTick,
  normalizeKalshiMomentumConfig,
  runKalshiMomentumPaperAgent,
  type PredictionMarketTradeIntent,
} from "../src/prediction-markets";

const ticker = "KX-DEMO";
const ticks = (prices: number[]) => prices.map((yesPriceCents, index) => ({
  ticker,
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  yesPriceCents,
}));

describe("Kalshi momentum paper agent", () => {
  it("enters YES after consecutive increases", () => {
    const result = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53]) });
    expect(result.steps.at(-1)?.intent).toMatchObject({ action: "BUY", outcome: "YES", priceCents: 53 });
    expect(result.strategyState.position).toMatchObject({ outcome: "YES", quantity: 10, entryPriceCents: 53 });
  });

  it("enters NO after consecutive decreases using the NO contract price", () => {
    const result = runKalshiMomentumPaperAgent({ ticks: ticks([50, 49, 48, 47]) });
    expect(result.steps.at(-1)?.intent).toMatchObject({ action: "BUY", outcome: "NO", priceCents: 53 });
    expect(result.strategyState.position?.outcome).toBe("NO");
  });

  it("holds when prices are flat or do not form a consecutive signal", () => {
    const result = runKalshiMomentumPaperAgent({ ticks: ticks([50, 50, 51, 50, 50]) });
    expect(result.steps.every((step) => step.intent.action === "HOLD")).toBe(true);
    expect(result.strategyState.position).toBeUndefined();
  });

  it("exits a YES position when momentum reverses", () => {
    const result = runKalshiMomentumPaperAgent({
      ticks: ticks([50, 51, 52, 53, 52, 51]),
      config: { profitTargetCents: 20, stopLossCents: 20 },
    });
    expect(result.steps.at(-1)?.intent).toMatchObject({ action: "SELL", outcome: "YES", reason: "Momentum reversed" });
    expect(result.strategyState.position).toBeUndefined();
  });

  it("exits at take profit and calculates realized P&L", () => {
    const result = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53, 58]) });
    expect(result.steps.at(-1)?.intent.reason).toContain("Profit target");
    expect(result.portfolio.realizedPnlCents).toBe(50);
    expect(result.portfolio.cashCents).toBe(10_050);
    expect(result.portfolio.equityCents).toBe(10_050);
  });

  it("exits at stop loss", () => {
    const result = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53, 50]) });
    expect(result.steps.at(-1)?.intent.reason).toContain("Stop loss");
    expect(result.portfolio.realizedPnlCents).toBe(-30);
  });

  it("enforces configured quantity limits before execution", () => {
    const result = runKalshiMomentumPaperAgent({
      ticks: ticks([50, 51, 52, 53]),
      config: { positionSize: 11, maxPosition: 10 },
    });
    expect(result.steps.at(-1)?.intent).toMatchObject({ action: "HOLD", outcome: null, quantity: 0 });
    expect(result.steps.at(-1)?.intent.reason).toContain("position limit");
  });

  it("rejects an entry when paper cash is insufficient", () => {
    const result = runKalshiMomentumPaperAgent({
      ticks: ticks([50, 51, 52, 53]),
      initialCashCents: 529,
    });
    expect(result.steps.at(-1)?.execution).toMatchObject({ status: "REJECTED", reason: "Insufficient paper cash" });
    expect(result.strategyState.position).toBeUndefined();
    expect(result.portfolio.cashCents).toBe(529);
  });

  it("tracks unrealized P&L on open positions", () => {
    const result = runKalshiMomentumPaperAgent({
      ticks: ticks([50, 51, 52, 53, 55]),
      config: { profitTargetCents: 10 },
    });
    expect(result.portfolio.unrealizedPnlCents).toBe(20);
    expect(result.portfolio.equityCents).toBe(10_020);
  });

  it("calculates NO-side realized P&L in outcome-price units", () => {
    const result = runKalshiMomentumPaperAgent({ ticks: ticks([50, 49, 48, 47, 42]) });
    expect(result.steps[3].intent).toMatchObject({ action: "BUY", outcome: "NO", priceCents: 53 });
    expect(result.steps[4].intent).toMatchObject({ action: "SELL", outcome: "NO", priceCents: 58 });
    expect(result.portfolio.realizedPnlCents).toBe(50);
    expect(result.portfolio.cashCents).toBe(10_050);
  });

  it("replays identical ticks deterministically", () => {
    const request = { ticks: ticks([50, 51, 52, 53, 54, 58]), initialCashCents: 10_000 };
    expect(runKalshiMomentumPaperAgent(request)).toEqual(runKalshiMomentumPaperAgent(request));
  });

  it("rejects mixed-market replays", () => {
    const mixedTicks = ticks([50, 51]);
    mixedTicks[1] = { ...mixedTicks[1], ticker: "DIFFERENT-MARKET" };
    expect(() => runKalshiMomentumPaperAgent({ ticks: mixedTicks })).toThrow("exactly one market");
  });
});

describe("Kalshi momentum strategy and executor validation", () => {
  it("rejects invalid configuration", () => {
    expect(() => normalizeKalshiMomentumConfig({ momentumThreshold: 6, lookback: 5 })).toThrow(
      "momentumThreshold cannot exceed lookback",
    );
  });

  it("keeps strategy state flat when a valid BUY is rejected by the executor", () => {
    const config = normalizeKalshiMomentumConfig({ momentumThreshold: 1, lookback: 1 });
    const first = evaluateKalshiMomentumTick(ticks([50])[0], createKalshiMomentumState(), config);
    const decision = evaluateKalshiMomentumTick(ticks([50, 51])[1], first.state, config);
    const executor = new InMemoryPaperExecutor({ initialCashCents: 0, maxPositionPerMarket: 50 });
    const execution = executor.execute(decision.intent);
    expect(execution.status).toBe("REJECTED");
  });

  it("rejects direct paper orders above the executor position limit", () => {
    const executor = new InMemoryPaperExecutor({ initialCashCents: 10_000, maxPositionPerMarket: 5 });
    const intent: PredictionMarketTradeIntent = {
      action: "BUY",
      outcome: "YES",
      ticker,
      quantity: 6,
      priceCents: 50,
      timestamp: "2026-01-01T00:00:00.000Z",
      reason: "test",
    };
    expect(executor.execute(intent)).toMatchObject({ status: "REJECTED", reason: "Position limit exceeded" });
  });
});

describe("momentum input boundaries", () => {
  it.each([0, 100])("accepts the %i-cent endpoint", (price) => {
    const result = runKalshiMomentumPaperAgent({ ticks: ticks([price]) });
    expect(result.steps[0].intent.action).toBe("HOLD");
    expect(result.portfolio.cashCents).toBe(10_000);
  });

  it.each([-1, 101, NaN, Infinity, 0.53, undefined])("rejects malformed price %s", (price) => {
    expect(() => runKalshiMomentumPaperAgent({
      ticks: [{ ...ticks([50])[0], yesPriceCents: price as number }],
    })).toThrow("integer from 0 through 100");
  });

  it("keeps insufficient history flat without cash or inventory changes", () => {
    const result = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52]) });
    expect(result.steps.map((step) => step.execution.status)).toEqual(["SKIPPED", "SKIPPED", "SKIPPED"]);
    expect(result.portfolio).toMatchObject({ cashCents: 10_000, positions: {}, realizedPnlCents: 0 });
  });

  it("rejects empty input", () => {
    expect(() => runKalshiMomentumPaperAgent({ ticks: [] })).toThrow("At least one");
  });

  it.each(["lookback", "momentumThreshold", "positionSize", "profitTargetCents", "stopLossCents", "maxPosition"] as const)(
    "rejects invalid %s values",
    (field) => {
      for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => normalizeKalshiMomentumConfig({ [field]: value })).toThrow("positive integer");
      }
    },
  );

  it.each(["invalid", "", "2026-01-01T00:00:00", "2026-02-30T00:00:00.000Z"])(
    "rejects ambiguous or malformed timestamp %s",
    (timestamp) => {
      expect(() => runKalshiMomentumPaperAgent({
        ticks: [{ ...ticks([50])[0], timestamp }],
      })).toThrow("valid ISO date-time");
    },
  );

  it.each(["duplicate", "out of order"] as const)("rejects %s observations", (kind) => {
    const observations = ticks([50, 51, 52, 53]);
    observations[3].timestamp = observations[kind === "duplicate" ? 2 : 1].timestamp;
    expect(() => runKalshiMomentumPaperAgent({ ticks: observations })).toThrow("strictly increasing");
  });

  it("treats equivalent timezone-offset instants as duplicates", () => {
    const observations = ticks([50, 51]);
    observations[1].timestamp = "2026-01-01T05:30:00+05:30";
    expect(() => runKalshiMomentumPaperAgent({ ticks: observations })).toThrow("strictly increasing");
  });

  it("does not combine history from different markets through the pure strategy API", () => {
    const config = normalizeKalshiMomentumConfig();
    const first = evaluateKalshiMomentumTick(ticks([50])[0], createKalshiMomentumState(), config);
    expect(() => evaluateKalshiMomentumTick(
      { ...ticks([50, 51])[1], ticker: "OTHER" }, first.state, config,
    )).toThrow("across markets");
    expect(first.state.lastYesPriceCents).toBe(50);
  });

  it("continues a matching strategy and portfolio snapshot without mutating the request", () => {
    const prefix = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53]) });
    const before = structuredClone(prefix);
    const continued = runKalshiMomentumPaperAgent({
      ticks: ticks([50, 51, 52, 53, 58]).slice(4),
      initialStrategyState: prefix.strategyState,
      initialPortfolio: prefix.portfolio,
    });
    expect(continued.portfolio).toEqual(runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53, 58]) }).portfolio);
    expect(prefix).toEqual(before);
  });

  it("rejects phantom strategy positions and untracked portfolio holdings", () => {
    const prefix = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53]) });
    const tail = ticks([50, 51, 52, 53, 58]).slice(4);
    expect(() => runKalshiMomentumPaperAgent({
      ticks: tail, initialStrategyState: prefix.strategyState,
    })).toThrow("must match");
    expect(() => runKalshiMomentumPaperAgent({
      ticks: tail, initialPortfolio: prefix.portfolio,
    })).toThrow("must match");
    const wrongPosition = structuredClone(prefix.portfolio);
    wrongPosition.positions[`${ticker}:YES`].quantity++;
    expect(() => runKalshiMomentumPaperAgent({
      ticks: tail, initialStrategyState: prefix.strategyState, initialPortfolio: wrongPosition,
    })).toThrow("must match");
  });

  it("rejects replaying a previously processed tick from a resumed state", () => {
    const prefix = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51]) });
    expect(() => runKalshiMomentumPaperAgent({
      ticks: ticks([50, 51]).slice(1), initialStrategyState: prefix.strategyState, initialPortfolio: prefix.portfolio,
    })).toThrow("strictly increasing");
  });
});

describe("paper portfolio authority", () => {
  const order = (overrides: Partial<PredictionMarketTradeIntent> = {}): PredictionMarketTradeIntent => ({
    action: "BUY", outcome: "YES", ticker, quantity: 2, priceCents: 50,
    timestamp: "2026-01-01T00:00:00.000Z", reason: "recorded intent", ...overrides,
  });
  const executor = () => new InMemoryPaperExecutor({ initialCashCents: 1_000, maxPositionPerMarket: 5 });

  it.each(["YES", "NO"] as const)("SELL %s closes only owned contracts", (outcome) => {
    const paper = executor();
    paper.execute(order({ outcome }));
    expect(paper.execute(order({ action: "SELL", outcome, priceCents: 55 })).status).toBe("FILLED");
    expect(paper.snapshot()).toMatchObject({ cashCents: 1_010, positions: {}, realizedPnlCents: 10 });
  });

  it("rejects sells without inventory, oversells and sales of the opposite outcome", () => {
    const paper = executor();
    expect(paper.execute(order({ action: "SELL" })).status).toBe("REJECTED");
    paper.execute(order());
    const before = paper.snapshot();
    expect(paper.execute(order({ action: "SELL", quantity: 3 })).status).toBe("REJECTED");
    expect(paper.execute(order({ action: "SELL", outcome: "NO" })).status).toBe("REJECTED");
    expect(paper.snapshot()).toEqual(before);
  });

  it("enforces limits on repeated buys and across both outcomes", () => {
    const paper = executor();
    paper.execute(order());
    paper.execute(order());
    const before = paper.snapshot();
    expect(paper.execute(order()).reason).toBe("Position limit exceeded");
    expect(paper.execute(order({ outcome: "NO" })).reason).toBe("Position limit exceeded");
    expect(paper.snapshot()).toEqual(before);
  });

  it("HOLD skips execution without changing cash, positions or P&L", () => {
    const paper = executor();
    paper.execute(order());
    const before = paper.snapshot();
    expect(paper.execute(order({ action: "HOLD", outcome: null, quantity: 0 })).status).toBe("SKIPPED");
    expect(paper.snapshot()).toEqual(before);
  });

  it.each([
    { priceCents: NaN }, { priceCents: 101 }, { priceCents: -1 }, { priceCents: 0.5 },
    { quantity: 0 }, { quantity: -1 }, { quantity: Infinity },
    { outcome: "MAYBE" }, { action: "SHORT" }, { ticker: "" }, { timestamp: "invalid" },
  ])("rejects malformed order %j without portfolio changes", (fields) => {
    const paper = executor();
    const before = paper.snapshot();
    expect(paper.execute(order(fields as Partial<PredictionMarketTradeIntent>)).status).toBe("REJECTED");
    expect(paper.snapshot()).toEqual(before);
  });

  it("rejects invalid marks before altering an open position", () => {
    const paper = executor();
    paper.execute(order());
    const before = paper.snapshot();
    expect(() => paper.mark(ticks([NaN])[0])).toThrow("integer from");
    expect(paper.snapshot()).toEqual(before);
  });

  it("retains an open strategy position when execution rejects its exit", () => {
    const prefix = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53]) });
    const intent = { ...prefix.steps[3].intent, action: "SELL" as const };
    const rejected = executor().execute(intent);
    expect(rejected.status).toBe("REJECTED");
    expect(applyMomentumExecution(prefix.strategyState, rejected)).toEqual(prefix.strategyState);
  });

  it("rejects negative cash and invalid or over-limit resumed holdings", () => {
    const portfolio = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53]) }).portfolio;
    expect(() => new InMemoryPaperExecutor({
      initialCashCents: 10_000, maxPositionPerMarket: 50,
      initialPortfolio: { ...portfolio, cashCents: -1 },
    })).toThrow("cash");
    expect(() => new InMemoryPaperExecutor({
      initialCashCents: 10_000, maxPositionPerMarket: 5, initialPortfolio: portfolio,
    })).toThrow("position limit");
  });
});

it("keeps strategy inventory aligned after a filled partial position exit", () => {
  const prefix = runKalshiMomentumPaperAgent({ ticks: ticks([50, 51, 52, 53]) });
  const paper = new InMemoryPaperExecutor({
    initialCashCents: 10_000, maxPositionPerMarket: 50, initialPortfolio: prefix.portfolio,
  });
  const execution = paper.execute({
    ...prefix.steps[3].intent, action: "SELL", quantity: 4, priceCents: 55,
  });
  expect(execution.status).toBe("FILLED");
  expect(applyMomentumExecution(prefix.strategyState, execution).position).toMatchObject({
    outcome: "YES", quantity: 6, entryPriceCents: 53,
  });
  expect(execution.portfolio.positions[`${ticker}:YES`]).toMatchObject({ quantity: 6, markPriceCents: 55 });
  expect(execution.portfolio.realizedPnlCents).toBe(8);
});
