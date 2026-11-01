import { expect, it } from "vitest";
import { fromKalshiMarket } from "../../src/strategy-signals/venues/kalshi-venue-mapping";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM } from "../../src/strategy-signals/demo";
import raw from "../../src/strategy-signals/fixtures/kalshi-venue/market.json";
import rawDollars from "../../src/strategy-signals/fixtures/kalshi-venue/market-dollars.json";
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
it("reads Kalshi 2026 fixed-point dollar quotes as the same decimal cents", () => {
  const quotes = (m: ReturnType<typeof fromKalshiMarket>) =>
    m.outcomes.map((o) => [o.bidCents, o.askCents]);
  expect(quotes(fromKalshiMarket(rawDollars))).toEqual(quotes(fromKalshiMarket(raw)));
  const edge = (yes_ask_dollars: string) =>
    fromKalshiMarket({ ...rawDollars, yes_ask_dollars }).outcomes[0].askCents;
  expect(edge("1.0000")).toBe(100);
  expect(edge("0.0000")).toBe(0);
  expect(edge("0")).toBe(0);
  expect(edge("0.000100")).toBe(0.01);
  expect(fromKalshiMarket({ ...rawDollars, no_bid_dollars: null }).outcomes[1].bidCents).toBeNull();
  expect(fromKalshiMarket({ ...rawDollars, yes_bid: 52 }).outcomes[0].bidCents).toBe(52);
});
it("keeps a sub-cent dollar quote and leaves rejection to execution", async () => {
  const market = fromKalshiMarket({ ...rawDollars, yes_ask_dollars: "0.5250" });
  expect(market.outcomes[0].askCents).toBe(52.5);
  const venue = new MockVenue("kalshi", [market]);
  const result = await venue.placeOrder({
    action: "BUY",
    outcome: "YES",
    ticker: market.marketId,
    quantity: 1,
    priceCents: 53,
    timestamp: time,
    reason: "sub-cent fixture",
  });
  expect(result.status).toBe("REJECTED");
  expect(result.reason).toMatch(/^sub-cent price 52.5¢/);
});
it.each([
  { yes_bid: 53 },
  { yes_ask_dollars: 0.55 },
  { yes_ask_dollars: "55" },
  { yes_ask_dollars: "1.5" },
  { yes_ask_dollars: "1.0001" },
  { yes_ask_dollars: "-0.10" },
  { yes_ask_dollars: "0.5500000" },
  { yes_ask_dollars: " 0.55" },
  { yes_ask_dollars: ".55" },
])("rejects conflicting or malformed dollar quote %j", (patch) =>
  expect(() => fromKalshiMarket({ ...rawDollars, yes_bid_dollars: "0.5200", ...patch })).toThrow(),
);
it.each([
  ["legacy integer cents", raw],
  ["2026 fixed-point dollars", rawDollars],
])("mapped %s market is consumed by graph and paper venue", async (_label, input) => {
  const market = fromKalshiMarket(input),
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
