import { expect, it } from "vitest";
import { fromPmxtMarket } from "../../src/strategy-signals/venues/pmxt-venue-mapping";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM } from "../../src/strategy-signals/demo";
import { toPredictionMarketIntent } from "../../src/strategy-signals/execution";
import raw from "../../src/strategy-signals/fixtures/pmxt-venue/market.json";
import { signal, time } from "./helpers";

it("keeps outcome IDs, labels, precise ticks and real quote sides", () => {
  const m = fromPmxtMarket(raw, { priceAsQuote: true });
  expect(m.outcomes.map((o) => [o.outcomeId, o.label, o.tickSizeCents])).toEqual([
    ["TOKEN-YES", "Yes", 0.1],
    ["TOKEN-NO", "No", 0.1],
  ]);
  expect(m.outcomes[0].askCents).toBeCloseTo(55, 12);
  expect(m.outcomes[1].askCents).toBeCloseTo(45, 12);
  expect(fromPmxtMarket(raw).outcomes[0].askCents).toBeNull();
  const explicit = {
    ...raw,
    outcomes: [{ ...raw.outcomes[0], bid: 0.51, ask: 0.57 }, raw.outcomes[1]],
  };
  expect(fromPmxtMarket(explicit).outcomes[0].bidCents).toBeCloseTo(51, 12);
  expect(fromPmxtMarket(explicit).outcomes[0].askCents).toBeCloseTo(57, 12);
  expect(fromPmxtMarket({ ...raw, resolutionDate: new Date(raw.resolutionDate) }).closesAt).toBe(
    "2026-01-02T00:00:00.000Z",
  );
});
it.each([
  null,
  [],
  {},
  { ...raw, outcomes: [...raw.outcomes, raw.outcomes[0]] },
  { ...raw, outcomes: [{ ...raw.outcomes[0], label: "Other" }, raw.outcomes[1]] },
  { ...raw, outcomes: [raw.outcomes[0], raw.outcomes[0]] },
  { ...raw, outcomes: [{ ...raw.outcomes[0], price: Infinity }, raw.outcomes[1]] },
  { ...raw, tickSize: 0 },
  { ...raw, resolutionDate: "tomorrow" },
])("rejects unknown and unsupported raw shapes", (input) =>
  expect(() => fromPmxtMarket(input)).toThrow(),
);

async function approve(input: unknown) {
  const market = fromPmxtMarket(input, { priceAsQuote: true }),
    venue = new MockVenue("polymarket", [market]);
  const s = signal({
    instrument: { type: "event", venue: "polymarket", marketId: market.marketId, outcome: "YES" },
    sizing: { quantity: 3, limitPriceCents: market.outcomes[0].askCents! },
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
  return { market, venue, result };
}
it("mapped pmxt mock price snapshot reaches an actual approved fill", async () => {
  const { venue, result } = await approve(raw);
  const fill = await venue.execute(result.state.approval!);
  expect(fill.status).toBe("FILLED");
  expect(fill.portfolio.cashCents).toBe(9835);
  expect(fill.portfolio.positions["PMXT-FIXTURE:YES"].quantity).toBe(3);
});
it("sub-cent price stays precise in the decision and fails execution without rounding", async () => {
  const { market, venue, result } = await approve({
    ...raw,
    outcomes: [{ ...raw.outcomes[0], price: 0.499 }, raw.outcomes[1]],
  });
  expect(market.outcomes[0].askCents).toBe(49.9);
  expect(result.state.approval?.proposal.limitPriceCents).toBe(49.9);
  expect(() => toPredictionMarketIntent(result.state.approval!)).toThrow("sub-cent price 49.9");
  await expect(venue.execute(result.state.approval!)).rejects.toThrow("sub-cent price 49.9");
  expect(
    venue.snapshot().kind === "event" &&
      (venue.snapshot() as { portfolio: { cashCents: number } }).portfolio.cashCents,
  ).toBe(10000);
});
