import { describe, expect, it } from "vitest";
import {
  InMemoryPaperExecutor,
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
