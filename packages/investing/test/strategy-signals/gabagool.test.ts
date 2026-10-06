import { describe, expect, it } from "vitest";
import {
  evaluateGabagool,
  normalizeGabagoolConfig,
} from "../../src/prediction-markets/strategies/gabagool";
import { gabagoolSource } from "../../src/strategy-signals/sources/gabagool";
import { runEventDemo, syntheticMarket } from "../../src/strategy-signals/demo";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { partitionValidSignals } from "../../src/strategy-signals/validate";
import fixture from "../../src/strategy-signals/fixtures/gabagool/sequence.json";
import golden from "./golden/gabagool-sequential.json";

const time = fixture.asOf;
const empty = {
  YES: { quantity: 0, averagePriceCents: 0 },
  NO: { quantity: 0, averagePriceCents: 0 },
};
function market(yes = 49, no = 52) {
  const m = syntheticMarket(fixture.marketId, yes, fixture.venue);
  m.outcomes[1].askCents = no;
  m.outcomes[1].bidCents = no;
  return m;
}
describe("gabagool independent sequential hedge", () => {
  it.each([
    [49.8, true],
    [49.9, true],
    [50, false],
  ])("preserves %s-cent boundary", (yesAskCents, enter) => {
    const result = evaluateGabagool({ yesAskCents, noAskCents: 55 }, empty);
    expect(result.reason.startsWith("waiting")).toBe(!enter);
    expect(normalizeGabagoolConfig().entryThresholdCents).toBe(49.9);
    if (enter) expect(result.limitPriceCents).toBe(yesAskCents);
  });
  it("first fill, wait, rejected second leg, later completion and already held match reviewed golden", async () => {
    const venue = new MockVenue(fixture.venue, [market()]);
    const run = async (yesAskCents: number, noAskCents: number) => {
      const m = market(yesAskCents, noAskCents);
      venue.setMarket(m);
      const signals = gabagoolSource.run(
        { ...fixture, yesAskCents, noAskCents },
        { account: venue.snapshot(), evaluationTime: time },
      );
      return runEventDemo(signals, gabagoolSource, venue, m, time);
    };
    const first = await run(49, 52);
    expect(first.signals[0].kind).toBe("portfolio");
    expect(first.approval?.proposal.outcome).toBe(golden.first.side);
    expect(first.fill?.fill?.quantity).toBe(golden.first.quantity);
    expect(first.after.kind === "event" && first.after.portfolio.cashCents).toBe(
      golden.first.cashCents,
    );
    const wait = await run(50, 52);
    expect(wait.signal.action).toBe(golden.wait.action);
    expect(wait.fill).toBeUndefined();
    expect(wait.after.kind === "event" && wait.after.portfolio.cashCents).toBe(
      golden.wait.cashCents,
    );
    const snapshot = venue.snapshot(),
      m = market(50, 48);
    const signals = gabagoolSource.run(
      { ...fixture, yesAskCents: 50, noAskCents: 48 },
      { account: snapshot, evaluationTime: time },
    );
    // Use the real chain but delay its execute call to reproduce a quote moving after approval.
    const originalExecute = venue.execute.bind(venue);
    venue.execute = async (approval) => {
      venue.setMarket(market(50, 50));
      return originalExecute(approval);
    };
    const rejected = await runEventDemo(signals, gabagoolSource, venue, m, time);
    expect(rejected.fill?.status).toBe("REJECTED");
    expect(venue.snapshot()).toEqual(snapshot);
    venue.execute = originalExecute;
    const complete = await run(50, 48);
    expect(complete.fill?.status).toBe("FILLED");
    expect(complete.approval?.proposal.outcome).toBe(golden.completion.side);
    expect(complete.fill?.fill?.quantity).toBe(golden.completion.quantity);
    expect(complete.after.kind === "event" && complete.after.portfolio.cashCents).toBe(
      golden.completion.cashCents,
    );
    const satisfied = await run(50, 48);
    expect(satisfied.signal.action).toBe(golden.satisfied.action);
    expect(satisfied.signals[0].reasoning).toContain(golden.satisfied.reason);
    expect(satisfied.fill).toBeUndefined();
  });
  it("gate-reduced fills determine next-leg sizing and actual average cost", async () => {
    const venue = new MockVenue(fixture.venue, [market()]);
    const firstSignals = gabagoolSource.run(fixture, {
      account: venue.snapshot(),
      evaluationTime: time,
    });
    const first = await runEventDemo(firstSignals, gabagoolSource, venue, market(), time, "BUY", {
      label: "demo",
      sizeMultiplier: 0.5,
      allowNewEntries: true,
    });
    expect(first.fill?.fill?.quantity).toBe(2);
    const next = gabagoolSource.run(
      { ...fixture, yesAskCents: 50, noAskCents: 48 },
      { account: venue.snapshot(), evaluationTime: time },
    )[0];
    expect(next.evidence?.yesHeld).toBe(2);
    expect(next.evidence?.yesActualAverageCents).toBe(49);
    expect(next.targets?.[0].outcome).toBe("NO");
    venue.setMarket(market(50, 48));
    const filled = await runEventDemo([next], gabagoolSource, venue, market(50, 48), time);
    expect(filled.proposal?.outcome).toBe("NO");
    expect(filled.fill?.status).toBe("FILLED");
    expect(
      filled.after.kind === "event" &&
        filled.after.portfolio.positions[`${fixture.marketId}:YES`].quantity,
    ).toBe(2);
    expect(
      filled.after.kind === "event" &&
        filled.after.portfolio.positions[`${fixture.marketId}:NO`].quantity,
    ).toBe(5);
    expect(filled.after.kind === "event" && filled.after.portfolio.cashCents).toBe(9662);
    const finalSignals = gabagoolSource.run(
      { ...fixture, yesAskCents: 50, noAskCents: 48 },
      { account: venue.snapshot(), evaluationTime: time },
    );
    const balanced = await runEventDemo(finalSignals, gabagoolSource, venue, market(50, 48), time);
    expect(balanced.fill?.fill?.quantity).toBe(3);
    expect(balanced.proposal?.outcome).toBe("YES");
    expect(
      balanced.after.kind === "event" &&
        balanced.after.portfolio.positions[`${fixture.marketId}:YES`].averageEntryPriceCents,
    ).toBe(49.6);
    expect(balanced.after.kind === "event" && balanced.after.portfolio.cashCents).toBe(9512);
  });
  it("sub-cent strategy proposals retain precision and execution rejects them", async () => {
    const venue = new MockVenue(fixture.venue, [market(49.9, 52)]);
    const signals = gabagoolSource.run(
      { ...fixture, yesAskCents: 49.9 },
      { account: venue.snapshot(), evaluationTime: time },
    );
    expect(signals[0].targets?.[0].priceCents).toBe(49.9);
    const validated = partitionValidSignals(signals, signals[0].instrument, time, gabagoolSource);
    expect(validated.rejected).toEqual([]);
    // The demo records the bridge rejection before the venue can mutate.
    const m = market(49.9, 52);
    const rejected = await runEventDemo(signals, gabagoolSource, venue, m, time);
    expect(rejected.executionRejection).toContain("49.9");
    expect(rejected.fill).toBeUndefined();
    expect(venue.snapshot().kind === "event" && (venue.snapshot() as any).portfolio.cashCents).toBe(
      10000,
    );
  });
  it.each([
    null,
    {},
    { ...fixture, yesAskCents: NaN },
    { ...fixture, config: { quantityPerSide: 1.5 } },
    { ...fixture, asOf: "2026-01-01T00:01:00Z" },
  ])("rejects malformed input %#", (input) => {
    const venue = new MockVenue(fixture.venue, [market()]);
    expect(() =>
      gabagoolSource.run(input as any, { account: venue.snapshot(), evaluationTime: time }),
    ).toThrow();
  });
  it("uses venue-scoped actual holdings and never a forecast", () => {
    const venue = new MockVenue(fixture.venue, [market()]);
    expect(
      gabagoolSource.run(fixture, { account: venue.snapshot(), evaluationTime: time })[0]
        .probability,
    ).toBeUndefined();
    expect(() =>
      gabagoolSource.run(fixture, {
        account: { ...venue.snapshot(), venue: "other" } as any,
        evaluationTime: time,
      }),
    ).toThrow();
  });
});
