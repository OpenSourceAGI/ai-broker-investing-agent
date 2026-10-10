import { expect, it } from "vitest";
import { evaluateBtcFusion } from "../../src/prediction-markets/strategies/btc15m-fusion";
import type { BtcProcessorSignal } from "../../src/prediction-markets/strategies/btc15m-fusion";
import { btc15mFusionSource, btc15mGuard } from "../../src/strategy-signals/sources/btc15m-fusion";
import type { BtcFusionInput } from "../../src/strategy-signals/sources/btc15m-fusion";
import { runEventDemo, syntheticMarket } from "../../src/strategy-signals/demo";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { applyRiskGate } from "../../src/strategy-signals/risk-gate";
import { selectProposal } from "../../src/strategy-signals/proposal";
import fixture from "../../src/strategy-signals/fixtures/btc15m-fusion/bullish.json";
import golden from "./golden/btc15m-fusion-weighted.json";

const input = fixture as BtcFusionInput,
  time = input.asOf;
const m = syntheticMarket(input.marketId, 50, input.venue);
it("weighted fusion matches independently reviewed arithmetic", () => {
  const result = evaluateBtcFusion(input.signals, time)!;
  expect(result.direction).toBe(golden.direction);
  expect(result.bullishContribution).toBeCloseTo(golden.bullishContribution, 12);
  expect(result.bearishContribution).toBeCloseTo(golden.bearishContribution, 12);
  expect(result.score).toBeCloseTo(golden.score, 12);
  expect(result.confidence).toBeCloseTo(golden.confidence, 12);
});
it("pins default processor weight and missing-strength fallback", () => {
  const result = evaluateBtcFusion(
    [{ source: "unrecognized-processor", direction: "BULLISH", confidence: 0.8, timestamp: time }],
    time,
  )!;
  expect(result.bullishContribution).toBeCloseTo((0.1 * 0.8 * 2) / 4, 12);
  expect(result.score).toBe(100);
  expect(evaluateBtcFusion([{ ...input.signals[0], confidence: 0 }], time)).toBeNull();
});
it.each(["BULLISH", "BEARISH"] as const)(
  "%s reaches an approved paper fill with $1 guard",
  async (direction) => {
    const venue = new MockVenue(input.venue, [m]);
    const signals = input.signals.map((s) => ({
      ...s,
      direction:
        direction === "BULLISH"
          ? s.direction
          : s.direction === "BULLISH"
            ? ("BEARISH" as const)
            : ("BULLISH" as const),
    }));
    const output = btc15mFusionSource.run(
      { ...input, signals, quantity: 20 },
      { account: venue.snapshot(), evaluationTime: time },
    );
    expect(output[0].probability).toBeUndefined();
    const result = await runEventDemo(output, btc15mFusionSource, venue, m, time);
    expect(result.fill?.status).toBe("FILLED");
    expect(result.fill?.fill?.quantity).toBe(golden.quantity);
    expect(result.approval?.proposal.outcome).toBe(direction === "BULLISH" ? "YES" : "NO");
    expect(result.after.kind === "event" && result.after.portfolio.cashCents).toBe(9900);
  },
);
it("bullish tie is preserved but 50% consensus is not actionable", () => {
  const signals: BtcProcessorSignal[] = [
    { source: "default", direction: "BULLISH", confidence: 1, strength: 4, timestamp: time },
    { source: "second", direction: "BEARISH", confidence: 1, strength: 4, timestamp: time },
  ];
  expect(evaluateBtcFusion(signals, time)).toMatchObject({
    direction: "BULLISH",
    score: 50,
    actionable: false,
  });
});
it("preserves strict five-minute boundary using explicit evaluation time", () => {
  const signal = { ...input.signals[0], timestamp: "2025-12-31T23:55:10Z" };
  expect(evaluateBtcFusion([signal], time)).toBeNull();
  expect(
    evaluateBtcFusion([{ ...signal, timestamp: "2025-12-31T23:55:10.001Z" }], time)?.recentCount,
  ).toBe(1);
  expect(
    evaluateBtcFusion([{ ...signal, timestamp: "2025-12-31T23:55:09.999Z" }], time),
  ).toBeNull();
  expect(
    btc15mFusionSource.run({ ...input, signals: [] }, { evaluationTime: time })[0].action,
  ).toBe("HOLD");
});
it("pins actionable confidence and score thresholds", () => {
  expect(evaluateBtcFusion([{ ...input.signals[0], confidence: 0.6 }], time)?.actionable).toBe(
    true,
  );
  expect(evaluateBtcFusion([{ ...input.signals[0], confidence: 0.5999 }], time)?.actionable).toBe(
    false,
  );
  const cases: BtcProcessorSignal[] = [
    { source: "default", direction: "BULLISH", confidence: 0.6, strength: 3, timestamp: time },
    { source: "second", direction: "BEARISH", confidence: 0.6, strength: 2, timestamp: time },
  ];
  expect(evaluateBtcFusion(cases, time)?.score).toBeCloseTo(60, 12);
  expect(evaluateBtcFusion(cases, time)?.actionable).toBe(true);
  expect(evaluateBtcFusion([{ ...cases[0], confidence: 0.5999 }, cases[1]], time)?.actionable).toBe(
    false,
  );
});
it.each(["UNKNOWN", "NEUTRAL", "BEARISH_BULLISH", null])(
  "rejects unknown direction %s",
  (direction) => {
    expect(() =>
      btc15mFusionSource.run({ ...input, signals: [{ ...input.signals[0], direction }] } as any, {
        evaluationTime: time,
      }),
    ).toThrow();
  },
);
it("rejects duplicate processor timestamps and unordered observations", () => {
  const s = input.signals[0];
  expect(() => evaluateBtcFusion([s, s], time)).toThrow("duplicate");
  expect(() => evaluateBtcFusion([{ ...s, timestamp: time }, s], time)).toThrow("ordered");
});
it.each([
  null,
  {},
  { ...input, signals: null },
  { ...input, signals: [null] },
  { ...input, quantity: Infinity },
  { ...input, config: { weights: { default: -1 } } },
  { ...input, signals: [{ ...input.signals[0], timestamp: "2026-01-01T01:00:00Z" }] },
])("rejects malformed input %#", (value) => {
  expect(() => btc15mFusionSource.run(value as any, { evaluationTime: time })).toThrow();
});
it("pins position, exposure and count caps on current holdings; exits skip entry guard", () => {
  const venue = new MockVenue(input.venue, [m]),
    account = venue.snapshot();
  if (account.kind !== "event") throw new Error("expected event snapshot");
  const s = btc15mFusionSource.run(input, { account, evaluationTime: time })[0];
  const context = { account, evaluationTime: time, instrument: s.instrument },
    selected = selectProposal("BUY", [s], context);
  if (!("proposal" in selected)) throw new Error("expected selected proposal");
  const p = selected.proposal;
  const gate = () =>
    applyRiskGate(
      { ...p, quantity: 20 },
      context,
      { maxPositionPerMarket: 1000 },
      { label: "normal", sizeMultiplier: 1, allowNewEntries: true },
      btc15mFusionSource,
      s,
    );
  expect(gate().maxQuantity).toBe(2);
  account.portfolio.positions[`${input.marketId}:YES`] = {
    ticker: input.marketId,
    outcome: "YES",
    quantity: 1,
    averageEntryPriceCents: 50,
    markPriceCents: 50,
    unrealizedPnlCents: 0,
  };
  expect(gate().maxQuantity).toBe(1);
  account.portfolio.positions[`${input.marketId}:YES`].quantity = 2;
  expect(gate().allowed).toBe(false);
  delete account.portfolio.positions[`${input.marketId}:YES`];
  for (let i = 0; i < 4; i++)
    account.portfolio.positions[`other-${i}:YES`] = {
      ticker: `other-${i}`,
      outcome: "YES",
      quantity: 5,
      averageEntryPriceCents: 49,
      markPriceCents: 49,
      unrealizedPnlCents: 0,
    };
  expect(gate().maxQuantity).toBe(0); // $9.80 exposure leaves only 20 cents.
  for (const holding of Object.values(account.portfolio.positions))
    holding.averageEntryPriceCents = 47.5;
  expect(gate().maxQuantity).toBe(1); // $9.50 plus exactly one 50-cent contract reaches $10.
  for (const holding of Object.values(account.portfolio.positions)) holding.quantity = 1;
  expect(gate().allowed).toBe(true); // Four positions still allow the fifth within the source cap.
  account.portfolio.positions["fifth:YES"] = {
    ticker: "fifth",
    outcome: "YES",
    quantity: 1,
    averageEntryPriceCents: 50,
    markPriceCents: 50,
    unrealizedPnlCents: 0,
  };
  expect(gate().reasons).toContain("BTC maximum 5 positions");
  expect(btc15mGuard({ ...p, action: "SELL" }, context, s)).toEqual({});
});
