import { it, expect, vi } from "vitest";
import { MockEquityBroker } from "../../src/strategy-signals/venues/mock-equity-broker";
import { toEquityOrder } from "../../src/strategy-signals/execution";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM } from "../../src/strategy-signals/demo";
import { time } from "./helpers";

it("executes directional stock decisions with cash preflight and actual shares", async () => {
  const fetch = vi.spyOn(globalThis, "fetch"),
    broker = new MockEquityBroker({ FIXTURE: 100 }, 25000);
  try {
    for (const action of ["BUY", "SELL"]) {
      const llm = demoLLM(action),
        graph = new TradingAgentsGraph([], false, undefined, {
          llm: { deep: llm, quick: llm },
          riskReview: true,
          riskLimits: { maxPositionPerMarket: 5 },
        });
      const r = await graph.propagate("FIXTURE", "2026-01-01", {
        instrument: { type: "equity", symbol: "FIXTURE" },
        account: broker.snapshot(),
        evaluationTime: time,
      });
      expect(r.signal.action).toBe(action);
      const order = toEquityOrder(r.state.approval!, 100, broker.snapshot());
      expect(order.qty).toBe(2);
      expect((await broker.createOrder(order)).status).toBe("FILLED");
    }
    expect(broker.snapshot()).toEqual({ kind: "equity", cashCents: 25000, shares: {} });
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
