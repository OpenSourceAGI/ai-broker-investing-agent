import { expect, it } from "vitest";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM } from "../../src/strategy-signals/demo";
import { approval, market, signal, time } from "./helpers";

// Kalshi taker fee at 50¢: ceil(0.07 × C × 0.5 × 0.5) → 18¢ for 10 contracts, 14¢ for 8.
const KALSHI_TAKER_BPS = 700;

it("charges the taker fee on paper buys and sells as realized P&L", async () => {
  const venue = new MockVenue("kalshi", [market], 10000, 50, KALSHI_TAKER_BPS);
  const buy = await venue.execute(approval());
  expect(buy.fill).toEqual({
    priceCents: 50,
    quantity: 10,
    cashChangeCents: -518,
    realizedPnlCents: -18,
    feeCents: 18,
  });
  expect(buy.portfolio.cashCents).toBe(9482);
  expect(buy.portfolio.positions["FIXTURE:YES"].averageEntryPriceCents).toBe(50);
  const sell = await venue.execute(
    approval({ proposal: { ...approval().proposal, action: "SELL" } }),
  );
  expect(sell.fill?.cashChangeCents).toBe(482);
  expect(sell.portfolio.cashCents).toBe(9964);
  expect(sell.portfolio.realizedPnlCents).toBe(-36);
});

it("rejects a buy whose fee does not fit in cash and keeps fee-free fills unchanged", async () => {
  const short = await new MockVenue("kalshi", [market], 517, 50, KALSHI_TAKER_BPS).execute(
    approval(),
  );
  expect(short.status).toBe("REJECTED");
  expect(short.reason).toBe("Insufficient paper cash");
  const free = await new MockVenue("kalshi", [market]).execute(approval());
  expect(free.fill).toEqual({
    priceCents: 50,
    quantity: 10,
    cashChangeCents: -500,
    realizedPnlCents: 0,
  });
});

it("graph sizes a forecast entry by fee-adjusted fractional Kelly and fills it net of fees", async () => {
  const venue = new MockVenue("kalshi", [market], 10000, 50, KALSHI_TAKER_BPS);
  const s = signal({ probability: 0.6, sizing: { quantity: 20, limitPriceCents: 50 } });
  const llm = demoLLM("BUY"),
    graph = new TradingAgentsGraph([], false, undefined, {
      riskReview: true,
      llm: { deep: llm, quick: llm },
      riskLimits: {
        maxPositionPerMarket: 50,
        takerFeeBps: KALSHI_TAKER_BPS,
        maxKellyFraction: 0.25,
        minNetEdgeCents: 5,
      },
    });
  const result = await graph.propagate("FIXTURE", "2026-01-01", {
    instrument: s.instrument,
    event: market,
    strategySignals: [s],
    account: venue.snapshot(),
    evaluationTime: time,
    sources: { fixture: { id: "fixture", upstream: "reviewed fixture", run: () => [s] } },
  });
  const approved = result.state.approval!;
  // cEff = 0.5 + 0.07 × 0.25 = 0.5175; f* = 0.0825 / 0.4825 = 0.170984;
  // ¼ Kelly × 10000¢ / 51.75¢ = 8.26 → 8 contracts; edge 60 − 50 − 14/8 = 8.25¢ ≥ 5¢.
  expect(approved.verdict.maxQuantity).toBe(8);
  expect(approved.finalQuantity).toBe(8);
  const fill = await venue.execute(approved);
  expect(fill.portfolio.cashCents).toBe(9586);
  expect(fill.fill?.feeCents).toBe(14);
});
