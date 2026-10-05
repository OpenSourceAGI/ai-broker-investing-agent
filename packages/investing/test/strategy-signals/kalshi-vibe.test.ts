import { describe, expect, it } from "vitest";
import { kalshiVibeSource } from "../../src/strategy-signals/sources/kalshi-vibe";
import {
  kalshiVibeGuard,
  vibeBuyFailure,
  vibeKellyQuantity,
} from "../../src/strategy-signals/sources/kalshi-vibe-guards";
import { selectProposal } from "../../src/strategy-signals/proposal";
import { applyRiskGate } from "../../src/strategy-signals/risk-gate";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { TradingAgentsGraph } from "../../src/trading-agents/graph/trading-graph";
import { demoLLM } from "../../src/strategy-signals/demo";
import type { VenueMarket, Outcome, TradeProposal } from "../../src/strategy-signals/types";
import yes from "../../src/strategy-signals/fixtures/kalshi-vibe/yes.json";
import no from "../../src/strategy-signals/fixtures/kalshi-vibe/no.json";
import golden from "./golden/kalshi-vibe-kelly.json";
import { time } from "./helpers";

const market = yes.market as VenueMarket;
const account = () => new MockVenue("kalshi", [market]).snapshot();
const context = () => ({ evaluationTime: time, account: account() });
const proposal = (priceCents = 55, outcome: Outcome = "YES"): TradeProposal => ({
  proposalId: "vibe-reference",
  sourceId: "kalshi-vibe",
  instrument: { type: "event", venue: "kalshi", marketId: "VIBE", outcome },
  action: "BUY",
  outcome,
  quantity: 50,
  limitPriceCents: priceCents,
  asOf: time,
});

describe("Vibe preserves forecast gates and full Kelly", () => {
  for (const g of golden)
    it(`reviewed Kelly ${g.cashCents}/${g.probabilityYes}/${g.outcome}/${g.priceCents}`, () => {
      expect(
        vibeKellyQuantity(g.cashCents, g.probabilityYes, g.outcome as Outcome, g.priceCents),
      ).toBe(g.quantity);
    });
  it.each([
    [0.55, "YES", 55, "edge below"],
    [0.59, "YES", 50, "below 60%"],
    [0.73, "YES", 50, "exceeds 22"],
    [0.91, "YES", 80, "exceeds 90%"],
    [0.6, "YES", 25.9, "exceeds 22"],
    [0.75, "YES", 60, "calibration"],
    [0.25, "NO", 60, "calibration"],
    [0.9, "NO", 55, "edge below"],
  ])("pins rejection p=%s side=%s price=%s", (p, side, price, reason) => {
    expect(vibeBuyFailure(p as number, side as Outcome, price as number)).toContain(reason);
  });
  it("pins minimum/maximum boundaries and precise calibration prices", () => {
    expect(vibeBuyFailure(0.6, "YES", 55)).toBeUndefined();
    expect(vibeBuyFailure(0.72, "YES", 50)).toBeUndefined();
    expect(vibeBuyFailure(0.9, "YES", 80)).toBeUndefined();
    expect(vibeBuyFailure(0.75, "YES", 65)).toContain("calibration");
    expect(vibeBuyFailure(0.75, "YES", 65.1)).toBeUndefined();
    expect(vibeBuyFailure(0.26, "YES", 25.9)).toContain("below 5");
    // The 26-cent floor is subsumed by the 60% minimum and 22-point ceiling.
    expect(vibeBuyFailure(0.6, "YES", 26)).toContain("exceeds 22");
  });
  it.each([NaN, Infinity, -1, 1.1])("invalid probability %s fails closed", (p) => {
    expect(vibeBuyFailure(p, "YES", 55)).toContain("invalid");
    expect(vibeKellyQuantity(10000, p, "YES", 55)).toBe(0);
  });
  it("uses current cash, limits over-large proposals, and does not invent a forecast", () => {
    const s = kalshiVibeSource.run(yes, context())[0];
    const c = context();
    const cap = applyRiskGate(
      proposal(),
      { ...c, instrument: s.instrument },
      { maxPositionPerMarket: 50 },
      { label: "normal", allowNewEntries: true, sizeMultiplier: 1 },
      kalshiVibeSource,
      s,
    );
    expect(cap.maxQuantity).toBe(9);
    expect(kalshiVibeGuard(proposal(), c, { ...s, probability: undefined }).deny).toContain(
      "genuine",
    );
    if (c.account.kind === "event") c.account.portfolio.cashCents = 55;
    expect(kalshiVibeGuard(proposal(), c, s).maxQuantity).toBe(1);
    expect(kalshiVibeSource.run(yes, c)[0].sizing?.quantity).toBe(1);
    expect(kalshiVibeGuard({ ...proposal(), action: "SELL" }, c, s)).toEqual({});
  });
  it("keeps the precise quote for decisions", () => {
    const input = structuredClone(yes);
    input.market.outcomes[0].askCents = 55.1;
    expect(kalshiVibeSource.run(input, context())[0].sizing?.limitPriceCents).toBe(55.1);
  });
  it.each([null, [], {}, { market: null, forecast: null }])(
    "rejects unknown shapes without field access",
    (input) => {
      expect(() => kalshiVibeSource.run(input, context())).toThrow();
    },
  );
  it("rejects unknown direction, invalid time, duplicate sides and foreign accounts", () => {
    expect(() =>
      kalshiVibeSource.run(
        { ...yes, forecast: { ...yes.forecast, direction: "MAYBE" } },
        context(),
      ),
    ).toThrow();
    expect(() =>
      kalshiVibeSource.run(
        { ...yes, forecast: { ...yes.forecast, asOf: "2027-01-01T00:00:00Z" } },
        context(),
      ),
    ).toThrow();
    expect(() =>
      kalshiVibeSource.run(
        { ...yes, market: { ...market, outcomes: [market.outcomes[0], market.outcomes[0]] } },
        context(),
      ),
    ).toThrow();
    expect(() =>
      kalshiVibeSource.run(yes, {
        evaluationTime: time,
        account: { ...account(), venue: "elsewhere" } as ReturnType<typeof account>,
      }),
    ).toThrow();
  });
  it("reports closed markets, SKIP, missing asks and unaffordable holdings", () => {
    expect(
      kalshiVibeSource.run({ ...yes, market: { ...market, status: "closed" } }, context())[0]
        .reasoning,
    ).toBe("market closed");
    expect(
      kalshiVibeSource.run(
        { ...yes, forecast: { ...yes.forecast, direction: "SKIP" } },
        context(),
      )[0].action,
    ).toBe("HOLD");
    const missing = structuredClone(yes) as unknown as {
      market: VenueMarket;
      forecast: typeof yes.forecast;
    };
    missing.market.outcomes[0].askCents = null;
    expect(kalshiVibeSource.run(missing, context())[0].reasoning).toContain("missing");
    const c = context();
    if (c.account.kind === "event") c.account.portfolio.cashCents = 0;
    expect(kalshiVibeSource.run(yes, c)[0].action).toBe("HOLD");
  });
});

for (const input of [yes, no])
  it(`recorded ${input.forecast.direction} forecast flows through graph and real paper fill`, async () => {
    const venue = new MockVenue("kalshi", [input.market as VenueMarket]);
    const signals = kalshiVibeSource.run(input, {
      account: venue.snapshot(),
      evaluationTime: time,
    });
    const llm = demoLLM("BUY");
    const graph = new TradingAgentsGraph([], false, undefined, {
      riskReview: true,
      llm: { deep: llm, quick: llm },
      riskLimits: { maxPositionPerMarket: 50 },
    });
    const result = await graph.propagate("VIBE", "2026-01-01", {
      instrument: signals[0].instrument,
      strategySignals: signals,
      account: venue.snapshot(),
      event: input.market as VenueMarket,
      evaluationTime: time,
      sources: { "kalshi-vibe": kalshiVibeSource },
    });
    expect(result.signal.action).toBe("BUY");
    expect(result.state.approval?.finalQuantity).toBe(9);
    const fill = await venue.execute(result.state.approval!);
    expect(fill.status).toBe("FILLED");
    expect(fill.portfolio.cashCents).toBe(9505);
    expect(fill.portfolio.positions[`VIBE:${input.forecast.direction}`].quantity).toBe(9);
    expect(signals[0].probability).toBe(input.forecast.probabilityYes);
    expect(
      selectProposal("BUY", signals, {
        instrument: signals[0].instrument,
        account: venue.snapshot(),
        evaluationTime: time,
      }),
    ).toHaveProperty("proposal");
  });
