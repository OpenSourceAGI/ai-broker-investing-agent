import { expect, it } from "vitest";
import { fromKalshiMarket } from "../../src/strategy-signals/venues/kalshi-venue-mapping";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM } from "../../src/strategy-signals/demo";
import raw from "../../src/strategy-signals/fixtures/kalshi-venue/market.json";
import { signal, time } from "./helpers";

it("preserves independent nullable bid/ask, explicit status and closing time", () => {
  const m = fromKalshiMarket(raw);
  expect(m.outcomes.map((o) => [o.bidCents, o.askCents])).toEqual([
    [52, 55],
    [40, 43],
  ]);
  expect(m.outcomes.map((o) => o.outcomeId)).toEqual(["KALSHI-FIXTURE:YES", "KALSHI-FIXTURE:NO"]);
  expect(
    fromKalshiMarket({ ...raw, yes_ask: null, no_bid: undefined }).outcomes.map((o) => [
      o.bidCents,
      o.askCents,
    ]),
  ).toEqual([
    [52, null],
    [null, 43],
  ]);
  expect(fromKalshiMarket({ ...raw, status: "paused" }).status).toBe("closed");
  expect(fromKalshiMarket({ ...raw, status: null }).status).toBe("closed");
  expect(m.closesAt).toBe("2026-01-02T00:00:00Z");
});
it.each([
  null,
  [],
  {},
  { ...raw, market_type: "categorical" },
  { ...raw, yes_ask: 55.1 },
  { ...raw, no_bid: NaN },
  { ...raw, yes_bid: 101 },
  { ...raw, status: "mystery" },
  { ...raw, close_time: "tomorrow" },
])("validates unknown raw models", (input) => expect(() => fromKalshiMarket(input)).toThrow());
it("mapped PyKalshi market is consumed by graph and paper venue", async () => {
  const market = fromKalshiMarket(raw),
    venue = new MockVenue("kalshi", [market]);
  const s = signal({
    instrument: { type: "event", venue: "kalshi", marketId: market.marketId, outcome: "YES" },
    sizing: { quantity: 3, limitPriceCents: 55 },
  });
  const llm = demoLLM("BUY"),
    graph = new TradingAgentsGraph([], false, undefined, {
      riskReview: true,
      llm: { deep: llm, quick: llm },
    });
  const result = await graph.propagate(market.marketId, "2026-01-01", {
    instrument: s.instrument,
    event: market,
    strategySignals: [s],
    account: venue.snapshot(),
    evaluationTime: time,
    sources: {
      fixture: { id: "fixture", upstream: "hand-reviewed mapping fixture", run: () => [s] },
    },
  });
  const fill = await venue.execute(result.state.approval!);
  expect(fill.status).toBe("FILLED");
  expect(fill.portfolio.cashCents).toBe(9835);
  expect(fill.portfolio.positions["KALSHI-FIXTURE:YES"].quantity).toBe(3);
});
