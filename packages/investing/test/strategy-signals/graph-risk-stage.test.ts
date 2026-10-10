import { it, expect } from "vitest";
import { graphRun, market, signal, time } from "./helpers";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM } from "../../src/strategy-signals/demo";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";

it.each([
  { cash: 0 },
  { judge: "BLOCK" },
  { fm: "PROPOSAL ID: <id>\nDECISION: REJECT" },
  { fm: "PROPOSAL ID: wrong\nDECISION: APPROVE\nAPPROVED QUANTITY: 10" },
  { fm: "PROPOSAL ID: <id>\nDECISION: APPROVE\nAPPROVED QUANTITY: 1.5" },
  { fm: "PROPOSAL ID: <id>\nDECISION: APPROVE\nAPPROVED QUANTITY: -1" },
  { fm: "PROPOSAL ID: <id>\nDECISION: APPROVE\nAPPROVED QUANTITY: NaN" },
  { modelError: true },
])("denial is HOLD in state and returned signal %#", async (options) => {
  const r = await graphRun(options);
  expect(r.state.finalTradeDecision).toBe("HOLD");
  expect(r.signal.action).toBe("HOLD");
  expect(r.state.approval).toBeUndefined();
  expect(
    r.venue.snapshot().kind === "event" && (r.venue.snapshot() as any).portfolio.cashCents,
  ).toBe(options.cash ?? 10000);
});
it("REDUCE is binding despite a larger manager approval", async () =>
  expect(
    (
      await graphRun({
        judge: "REDUCE 3",
        fm: "PROPOSAL ID: <id>\nDECISION: APPROVE\nAPPROVED QUANTITY: 8",
      })
    ).state.approval?.finalQuantity,
  ).toBe(3));
it("MODIFY can only reduce", async () =>
  expect(
    (await graphRun({ fm: "PROPOSAL ID: <id>\nDECISION: MODIFY\nAPPROVED QUANTITY: 2" })).state
      .approval?.finalQuantity,
  ).toBe(2));
it.each([
  { fundError: true },
  { unregistered: true },
  { fm: "missing closing approval" },
  { judge: "REDUCE 0" },
])("fails closed on missing risk ownership or approval %#", async (options) => {
  const r = await graphRun(options);
  expect(r.state.finalTradeDecision).toBe("HOLD");
  expect(r.signal.action).toBe("HOLD");
  expect(r.state.approval).toBeUndefined();
});
it.each([null, {}, "invalid"])(
  "reports a malformed signal collection without granting approval %#",
  async (strategySignals) => {
    const venue = new MockVenue("kalshi", [market]),
      llm = demoLLM("BUY");
    const before = venue.snapshot();
    const graph = new TradingAgentsGraph([], false, undefined, {
      riskReview: true,
      llm: { deep: llm, quick: llm },
    });
    const result = await graph.propagate("FIXTURE", "2026-01-01", {
      instrument: signal().instrument,
      strategySignals: strategySignals as any,
      account: venue.snapshot(),
      event: market,
      evaluationTime: time,
    });
    expect(result.state.strategySignals).toEqual([]);
    expect(result.state.strategySignalsReport).toContain("signals must be an array");
    expect(result.signal.action).toBe("HOLD");
    expect(result.state.approval).toBeUndefined();
    expect(venue.snapshot()).toEqual(before);
  },
);
