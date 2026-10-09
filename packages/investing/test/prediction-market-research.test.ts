import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryPaperExecutor, predictionMarketResearch, reviewPredictionMarketIntent,
  runKalshiMomentumPaperAgentWithResearch, type PredictionMarketTradeIntent,
} from "../src/prediction-markets";
import { TradingAgentsGraph } from "../src/trading-agents/graph/trading-graph";
import type { TradeSignal } from "../src/trading-agents/types";
import { fixtureConfig, RecordedMomentumLLM, momentumDemoTicks, runKalshiMomentumResearchDemo } from "../examples/fixtures/kalshi-momentum-research";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const portfolio = () => new InMemoryPaperExecutor({ initialCashCents: 10_000, maxPositionPerMarket: 50 }).snapshot();
const intent: PredictionMarketTradeIntent = {
  action: "BUY", outcome: "YES", ticker: "DEMO-KALSHI-MARKET", quantity: 10, priceCents: 53,
  timestamp: momentumDemoTicks[3].timestamp, reason: "Recorded momentum",
};
const reviewOptions = { fundManagerReview: true };
function reviewedGraph(fundResponse?: string, riskReview = true) {
  const model = new RecordedMomentumLLM(), original = model.invoke.bind(model);
  const calls = vi.spyOn(model, "invoke").mockImplementation(input => {
    if (typeof input === "string" && input.includes("the **Fund Manager**") && fundResponse !== undefined) {
      const id = input.match(/"proposalId":"([^"]+)"/)?.[1] ?? "missing";
      return Promise.resolve({ content: fundResponse.replaceAll("<id>", id) });
    }
    return original(input);
  });
  return { graph: new TradingAgentsGraph([], false, fixtureConfig, { llm: { deep: model, quick: model }, riskReview }), calls };
}

describe("momentum through the existing upstream approval pipeline", () => {
  it("carries research, binary intent and cash in the existing normalized structures", async () => {
    const report = predictionMarketResearch(intent, portfolio());
    expect(report.data?.intent).toEqual(intent);
    expect(report.findings.join(" ")).toContain("SELL closes the named outcome");
    const { graph, calls } = reviewedGraph();
    expect((await reviewPredictionMarketIntent(graph, intent, portfolio(), reviewOptions)).action).toBe("BUY");
    expect(calls).toHaveBeenCalledTimes(13);
    const state = graph.getCurrentState()!;
    expect(state.instrument).toMatchObject({ type: "event", venue: "kalshi", outcome: "YES" });
    expect(state.strategySignals?.[0].order).toEqual(intent);
    expect(state.strategySignalsReport).toContain("cashCents");
    expect(state.investmentDebateState.count).toBe(6);
    expect(state.riskDebateState.count).toBe(3);
    expect(state.fundManagerApproval).toMatchObject({ decision: "APPROVE", quantity: 10 });
    expect(state.approval?.proposal.action).toBe("BUY");
    const fundPrompt = calls.mock.calls.map(([input]) => input).find(input => typeof input === "string" && input.includes("the **Fund Manager**"));
    expect(fundPrompt).toContain("Trader recommendation:");
    expect(fundPrompt).toContain("cashCents");
    expect(fundPrompt).toContain("Research Manager decision:");
  });

  it.each([["BUY", 3], ["SELL", 4]] as const)("approval preserves the full %s YES intent", async (action, index) => {
    const result = await runKalshiMomentumResearchDemo();
    expect(result.steps[index].intent).toMatchObject({ action, outcome: "YES", quantity: 10 });
    expect(result.steps[index].execution.intent).toEqual(result.steps[index].intent);
    expect(result.steps[index].execution.status).toBe("FILLED");
    expect(result.steps[index].researchSignal?.reasoning).toContain("DECISION: APPROVE");
  });

  it.each([
    "PROPOSAL ID: <id>\nDECISION: REJECT",
    "Malformed portfolio response",
    "PROPOSAL ID: <id>\nAPPROVED QUANTITY: 10",
    "PROPOSAL ID: wrong\nDECISION: APPROVE\nAPPROVED QUANTITY: 10",
    "PROPOSAL ID: <id>\nDECISION: MODIFY\nAPPROVED QUANTITY: 10",
    "PROPOSAL ID: <id>\nDECISION: APPROVE\nAPPROVED QUANTITY: 2",
  ])("holds rather than execute unsupported approval %s", async content => {
    const { graph } = reviewedGraph(content);
    const result = await runKalshiMomentumPaperAgentWithResearch(
      { ticks: momentumDemoTicks.slice(0, 4) },
      (order, state) => reviewPredictionMarketIntent(graph, order, state, reviewOptions),
    );
    expect(result.steps[3].execution).toMatchObject({ status: "SKIPPED", intent: { action: "HOLD", outcome: null, quantity: 0 } });
    expect(result.portfolio).toMatchObject({ cashCents: 10_000, positions: {} });
    expect(result.strategyState.position).toBeUndefined();
  });

  it("MODIFY of SELL YES never becomes BUY NO", async () => {
    const prefix = await runKalshiMomentumResearchDemo({ ticks: momentumDemoTicks.slice(0, 4) });
    const { graph } = reviewedGraph("PROPOSAL ID: <id>\nDECISION: MODIFY\nAPPROVED QUANTITY: 10");
    const result = await runKalshiMomentumPaperAgentWithResearch(
      { ticks: momentumDemoTicks.slice(4), initialStrategyState: prefix.strategyState, initialPortfolio: prefix.portfolio },
      (order, state) => reviewPredictionMarketIntent(graph, order, state, reviewOptions),
    );
    expect(result.steps[0].intent).toMatchObject({ action: "SELL", outcome: "YES" });
    expect(result.steps[0].execution.status).toBe("SKIPPED");
    expect(result.strategyState.position).toEqual(prefix.strategyState.position);
    expect(result.portfolio.positions["DEMO-KALSHI-MARKET:NO"]).toBeUndefined();
  });

  it("requires approval when opted in, without changing unrelated graph callers", async () => {
    const { graph, calls } = reviewedGraph(undefined, false);
    expect((await reviewPredictionMarketIntent(graph, intent, portfolio())).action).toBe("BUY");
    expect(calls).toHaveBeenCalledTimes(8);
    expect(graph.getCurrentState()?.finalApproval).toBeUndefined();
    expect((await reviewPredictionMarketIntent(graph, intent, portfolio(), reviewOptions)).action).toBe("HOLD");
  });

  it("respects the investment judge's BUY veto", async () => {
    const { graph, calls } = reviewedGraph();
    const original = calls.getMockImplementation()!;
    calls.mockImplementation(input => typeof input === "string" && input.includes("an Investment Judge")
      ? Promise.resolve({ content: "FINAL DECISION: NOT INVEST" }) : original(input));
    expect((await reviewPredictionMarketIntent(graph, intent, portfolio(), reviewOptions)).action).toBe("HOLD");
  });

  it("calls FundManager after Trader and before each execution exactly once", async () => {
    const { graph, calls } = reviewedGraph();
    const events: string[] = [], originalModel = calls.getMockImplementation()!;
    calls.mockImplementation(input => {
      const text = typeof input === "string" ? input : input.map(m => m.content).join("\n");
      if (text.includes("You are a trading agent")) events.push("Trader");
      if (text.includes("You are the **Fund Manager**")) events.push("FundManager");
      return originalModel(input);
    });
    const originalExecute = InMemoryPaperExecutor.prototype.execute;
    vi.spyOn(InMemoryPaperExecutor.prototype, "execute").mockImplementation(function (this: InMemoryPaperExecutor, order) {
      if (order.action !== "HOLD") events.push(`Executor:${order.action}`);
      return originalExecute.call(this, order);
    });
    const result = await runKalshiMomentumPaperAgentWithResearch({ ticks: momentumDemoTicks },
      (order, state) => reviewPredictionMarketIntent(graph, order, state, reviewOptions));
    expect(events).toEqual(["Trader", "FundManager", "Executor:BUY", "Trader", "FundManager", "Executor:SELL"]);
    expect(result.strategyState.tradesExecuted).toBe(2);
  });

  it("approval against a stale cash snapshot cannot bypass the executor", async () => {
    const { graph } = reviewedGraph();
    const result = await runKalshiMomentumPaperAgentWithResearch(
      { ticks: momentumDemoTicks.slice(0, 4), initialCashCents: 0 },
      order => reviewPredictionMarketIntent(graph, order, portfolio(), reviewOptions),
    );
    expect(result.steps[3].researchSignal?.reasoning).toContain("DECISION: APPROVE");
    expect(result.steps[3].execution).toMatchObject({ status: "REJECTED", reason: "Insufficient paper cash" });
    expect(result.portfolio).toMatchObject({ cashCents: 0, positions: {} });
    expect(result.strategyState.position).toBeUndefined();
    expect(result.strategyState.tradesExecuted).toBe(0);
  });

  it("upstream cash preflight cannot resize this replay's intent silently", async () => {
    const result = await runKalshiMomentumResearchDemo({ ticks: momentumDemoTicks.slice(0, 4), initialCashCents: 529 });
    expect(result.steps[3].execution.status).toBe("SKIPPED");
    expect(result.portfolio).toMatchObject({ cashCents: 529, positions: {} });
    expect(result.strategyState.position).toBeUndefined();
  });

  it("upstream position caps can veto before execution", async () => {
    const model = new RecordedMomentumLLM();
    const graph = new TradingAgentsGraph([], false, fixtureConfig, {
      llm: { deep: model, quick: model }, riskReview: true, riskLimits: { maxPositionPerMarket: 5 },
    });
    expect((await reviewPredictionMarketIntent(graph, intent, portfolio(), reviewOptions)).action).toBe("HOLD");
  });

  it("keeps NO entry and exit semantics", async () => {
    const result = await runKalshiMomentumResearchDemo({
      ticks: [50, 49, 48, 47, 42].map((yesPriceCents, i) => ({ ...momentumDemoTicks[i], yesPriceCents })),
    });
    expect(result.steps[3].execution.intent).toMatchObject({ action: "BUY", outcome: "NO", priceCents: 53 });
    expect(result.steps[4].execution.intent).toMatchObject({ action: "SELL", outcome: "NO", priceCents: 58 });
  });

  it("normalizes offset timestamps for upstream while retaining the original intent", async () => {
    const ticks = structuredClone(momentumDemoTicks.slice(0, 4));
    ticks[3].timestamp = "2026-01-01T05:33:00+05:30";
    const result = await runKalshiMomentumResearchDemo({ ticks });
    expect(result.steps[3].execution.status).toBe("FILLED");
    expect(result.steps[3].execution.intent).toEqual(result.steps[3].intent);
    expect(result.steps[3].researchSignal?.timestamp.toISOString()).toBe(momentumDemoTicks[3].timestamp);
  });

  it("is deterministic without credentials or fetch", async () => {
    const network = vi.fn(() => { throw new Error("Network forbidden"); });
    vi.stubGlobal("fetch", network);
    const first = await runKalshiMomentumResearchDemo(), second = await runKalshiMomentumResearchDemo();
    expect(first).toEqual(second);
    expect(first.portfolio).toMatchObject({ cashCents: 10_050, realizedPnlCents: 50, positions: {} });
    expect(network).not.toHaveBeenCalled();
  });

  it.each([-0.1, 1.1, NaN, Infinity])("rejects invalid callback confidence %s", async confidence => {
    const response: TradeSignal = { action: "BUY", confidence, reasoning: "test", timestamp: new Date(intent.timestamp) };
    await expect(runKalshiMomentumPaperAgentWithResearch({ ticks: momentumDemoTicks }, async () => response)).rejects.toThrow("invalid TradeSignal");
  });

  it("callback failures do not modify the caller's portfolio", async () => {
    const request = { ticks: structuredClone(momentumDemoTicks), initialPortfolio: portfolio() }, before = structuredClone(request);
    await expect(runKalshiMomentumPaperAgentWithResearch(request, async () => { throw new Error("Review timeout"); })).rejects.toThrow("Review timeout");
    expect(request).toEqual(before);
  });
});

describe("approval boundary rejects corrupted or rewritten proposals", () => {
  it.each([
    ["action", { action: "SELL" }],
    ["outcome", { outcome: "NO" }],
    ["price", { limitPriceCents: 54 }],
    ["market", { instrument: { type: "event", venue: "kalshi", marketId: "OTHER", outcome: "YES" } }],
    ["timestamp", { asOf: "2026-01-01T00:04:00.000Z" }],
  ] as const)("vetoes a changed %s even when a graph reports APPROVE", async (_field, changes) => {
    const { graph } = reviewedGraph();
    const signal = await reviewPredictionMarketIntent(graph, intent, portfolio(), reviewOptions);
    const state = graph.getCurrentState()!;
    state.approval = { ...state.approval!, proposal: { ...state.approval!.proposal, ...changes } };
    vi.spyOn(graph, "propagate").mockResolvedValue({ state, signal });
    const decision = await reviewPredictionMarketIntent(graph, intent, portfolio(), reviewOptions);
    expect(decision).toMatchObject({ action: "HOLD" });
    expect(decision.reasoning).toContain("Approved proposal differs from the original intent");
    expect(intent).toMatchObject({ action: "BUY", outcome: "YES", quantity: 10, priceCents: 53 });
  });

  it.each(["proposal binding", "risk verdict", "quantity", "sub-cent price", "instrument"] as const)(
    "fails closed for invalid execution approval: %s", async field => {
      const { graph } = reviewedGraph();
      const signal = await reviewPredictionMarketIntent(graph, intent, portfolio(), reviewOptions);
      const state = graph.getCurrentState()!, approval = state.approval!;
      if (field === "proposal binding") approval.fundManager.proposalId = "another-proposal";
      if (field === "risk verdict") approval.verdict.allowed = false;
      if (field === "quantity") approval.finalQuantity = 11;
      if (field === "sub-cent price") approval.proposal.limitPriceCents = 53.5;
      if (field === "instrument") approval.proposal.instrument = { type: "equity", symbol: "OTHER" };
      vi.spyOn(graph, "propagate").mockResolvedValue({ state, signal });
      const decision = await reviewPredictionMarketIntent(graph, intent, portfolio(), reviewOptions);
      expect(decision.action).toBe("HOLD");
      expect(decision.reasoning).toContain("Invalid execution approval");
    },
  );

  it("normalizes HOLD as research without attaching an executable order or outcome", async () => {
    const { graph } = reviewedGraph(undefined, false);
    const signal = await reviewPredictionMarketIntent(graph, intent, portfolio());
    const state = graph.getCurrentState()!;
    const propagate = vi.spyOn(graph, "propagate").mockResolvedValue({ state, signal: { ...signal, action: "HOLD" } });
    const hold = { ...intent, action: "HOLD" as const, outcome: null, quantity: 0 };
    expect((await reviewPredictionMarketIntent(graph, hold, portfolio())).action).toBe("HOLD");
    const normalized = propagate.mock.calls[0][2]!.strategySignals![0];
    expect(normalized).toMatchObject({ kind: "signal", action: "HOLD" });
    expect(normalized.order).toBeUndefined();
    expect(normalized.instrument).not.toHaveProperty("outcome");
    expect(JSON.parse(normalized.evidence!.research as string).data.intent).toEqual(hold);
  });

  it("retains Trader reasoning if the graph supplies no review summaries", async () => {
    const { graph } = reviewedGraph(undefined, false);
    const signal = await reviewPredictionMarketIntent(graph, intent, portfolio());
    const state = graph.getCurrentState()!;
    state.investmentDebateState.judgeDecision = "";
    state.traderInvestmentPlan = "";
    state.finalRiskAdjustedPlan = "";
    state.fundManagerDecision = "";
    state.riskReviewReason = "";
    vi.spyOn(graph, "propagate").mockResolvedValue({ state, signal: { ...signal, action: "SELL", reasoning: "Trader exit rationale" } });
    const sell = { ...intent, action: "SELL" as const };
    expect(await reviewPredictionMarketIntent(graph, sell, portfolio()))
      .toMatchObject({ action: "SELL", reasoning: "Trader exit rationale" });
  });

  it("fails before execution when a review callback returns no signal", async () => {
    const request = { ticks: structuredClone(momentumDemoTicks), initialPortfolio: portfolio() };
    const before = structuredClone(request);
    const execute = vi.spyOn(InMemoryPaperExecutor.prototype, "execute");
    await expect(runKalshiMomentumPaperAgentWithResearch(request, async () => undefined as unknown as TradeSignal))
      .rejects.toThrow("must return a TradeSignal");
    expect(execute.mock.calls.every(([order]) => order.action === "HOLD")).toBe(true);
    expect(request).toEqual(before);
  });
});
