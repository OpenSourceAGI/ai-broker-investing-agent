import { it, expect } from "vitest";
import { applyRiskGate } from "../../src/strategy-signals/risk-gate";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { approval, market, signal, time } from "./helpers";
import type { RiskLimits } from "../../src/strategy-signals/types";
const limits: RiskLimits = { maxPositionPerMarket: 50 },
  posture = { label: "normal", sizeMultiplier: 1, allowNewEntries: true };
function gate(cash: number, p = approval().proposal, l = limits, post = posture) {
  return applyRiskGate(
    p,
    {
      instrument: p.instrument,
      account: new MockVenue("kalshi", [market], cash).snapshot(),
      evaluationTime: time,
    },
    l,
    post,
  );
}
it.each([
  [0, 0],
  [49, 0],
  [50, 1],
  [499, 9],
  [500, 10],
])("cash %s limits to %s", (cash, q) => expect(gate(cash).maxQuantity).toBe(q));
it("caps position and posture", () => {
  expect(gate(10000, approval().proposal, { maxPositionPerMarket: 3 }).maxQuantity).toBe(3);
  expect(
    gate(10000, approval().proposal, limits, { ...posture, sizeMultiplier: 0.5 }).maxQuantity,
  ).toBe(5);
  expect(
    gate(10000, approval().proposal, limits, { ...posture, allowNewEntries: false }).allowed,
  ).toBe(false);
});
it("rejects opening past position count and SELL without holdings", () => {
  expect(gate(10000, approval().proposal, { ...limits, maxOpenPositions: 0 }).allowed).toBe(false);
  expect(gate(10000, { ...approval().proposal, action: "SELL" }).allowed).toBe(false);
});
it("applies tighter source cap and rejects invalid guard caps", () => {
  const p = approval().proposal,
    c = {
      instrument: p.instrument,
      account: new MockVenue("kalshi", [market]).snapshot(),
      evaluationTime: time,
    };
  expect(
    applyRiskGate(
      p,
      c,
      limits,
      posture,
      { id: "fixture", guards: [() => ({ maxQuantity: 2 })] },
      signal(),
    ).maxQuantity,
  ).toBe(2);
  expect(
    applyRiskGate(
      p,
      c,
      limits,
      posture,
      { id: "fixture", guards: [() => ({ maxQuantity: NaN })] },
      signal(),
    ).allowed,
  ).toBe(false);
});
it("allows real exits under Critical posture", async () => {
  const v = new MockVenue("kalshi", [market]);
  await v.execute(approval());
  const p = { ...approval().proposal, action: "SELL" as const };
  expect(
    applyRiskGate(
      p,
      { instrument: p.instrument, account: v.snapshot(), evaluationTime: time },
      limits,
      { label: "Critical", sizeMultiplier: 0, allowNewEntries: false },
      { id: "fixture", guards: [() => ({ deny: "entry rule" })] },
      signal(),
    ).maxQuantity,
  ).toBe(10);
});

// Forecast limits. With P = P(win), entry c and fee rate k, all-in cost is
// cEff = c + k·c·(1 − c) and full Kelly is f* = (P − cEff)/(1 − cEff); the gate caps
// quantity at floor(fraction · f* · cash / (cEff · 100)).
function forecastGate(
  l: Partial<RiskLimits>,
  probability: number | undefined,
  overrides: { outcome?: "YES" | "NO"; quantity?: number; cash?: number } = {},
) {
  const outcome = overrides.outcome ?? "YES",
    base = approval().proposal,
    p = {
      ...base,
      outcome,
      instrument: { ...base.instrument, outcome },
      quantity: overrides.quantity ?? base.quantity,
    };
  return applyRiskGate(
    p,
    {
      instrument: p.instrument,
      account: new MockVenue("kalshi", [market], overrides.cash ?? 10000).snapshot(),
      evaluationTime: time,
    },
    { ...limits, ...l },
    posture,
    undefined,
    signal({ probability, instrument: p.instrument }),
  );
}
it("charges the taker fee against cash", () => {
  expect(gate(500, approval().proposal, { ...limits, takerFeeBps: 700 }).maxQuantity).toBe(9);
  expect(gate(500).maxQuantity).toBe(10);
});
it.each([
  [0.25, 0, 10], // f* = 0.2 → 500¢ / 50¢
  [0.25, 700, 8], // cEff 0.5175, f* 0.170984 → 427.46¢ / 51.75¢ = 8.26
  [0.5, 700, 16], // 854.92¢ / 51.75¢ = 16.52
])("fraction %s of Kelly at %s bps caps at %s", (fraction, bps, cap) => {
  const v = forecastGate({ maxKellyFraction: fraction, takerFeeBps: bps }, 0.6, { quantity: 20 });
  expect(v.maxQuantity).toBe(cap);
  expect(v.reasons).toContain(`fractional Kelly cap ${cap}`);
});
it("denies an entry with no Kelly edge after fees", () => {
  const v = forecastGate({ maxKellyFraction: 0.25 }, 0.5);
  expect(v.allowed).toBe(false);
  expect(v.reasons.at(-1)).toBe("no positive Kelly edge after fees");
  expect(forecastGate({ maxKellyFraction: 0.25, takerFeeBps: 700 }, 0.51).allowed).toBe(false);
});
it("enforces a minimum edge per contract after fees", () => {
  // 60 − 50 − 18¢/10 = 8.20¢
  expect(forecastGate({ minNetEdgeCents: 8, takerFeeBps: 700 }, 0.6).maxQuantity).toBe(10);
  const v = forecastGate({ minNetEdgeCents: 8.5, takerFeeBps: 700 }, 0.6);
  expect(v.allowed).toBe(false);
  expect(v.reasons.at(-1)).toBe("net edge 8.20¢ below 8.5¢ after fees");
  // NO side wins with 1 − P(YES): 70 − 50 − 1.8 = 18.20¢
  expect(
    forecastGate({ minNetEdgeCents: 18.3, takerFeeBps: 700 }, 0.3, { outcome: "NO" }).reasons.at(-1),
  ).toBe("net edge 18.20¢ below 18.3¢ after fees");
});
it("skips forecast limits without a genuine P(YES) and checks signal identity", () => {
  const v = forecastGate({ maxKellyFraction: 0.25 }, undefined);
  expect(v.maxQuantity).toBe(10);
  expect(v.reasons).toContain("forecast limits skipped: no P(YES)");
  const p = approval().proposal;
  expect(
    applyRiskGate(
      p,
      { instrument: p.instrument, account: new MockVenue("kalshi", [market]).snapshot(), evaluationTime: time },
      { ...limits, maxKellyFraction: 0.25 },
      posture,
      undefined,
      signal({ sourceId: "other", probability: 0.9 }),
    ).reasons.at(-1),
  ).toBe("signal identity mismatch");
});
it.each([
  ["5 s old", "2026-01-01T00:00:05Z", true],
  ["exactly at the limit", "2026-01-01T00:00:00Z", true],
  ["11 s old", "2025-12-31T23:59:59Z", false],
  ["from the future", "2026-01-01T00:00:11Z", false],
  ["missing", undefined, false],
  ["not ISO UTC", "yesterday", false],
])("quote %s is allowed: %s", (_label, quotedAt, allowed) => {
  const p = approval().proposal;
  const v = applyRiskGate(
    p,
    {
      instrument: p.instrument,
      account: new MockVenue("kalshi", [market]).snapshot(),
      evaluationTime: time,
      event: { ...market, quotedAt },
    },
    { ...limits, maxQuoteAgeMs: 10_000 },
    posture,
  );
  expect(v.allowed).toBe(allowed);
  if (!allowed) expect(v.reasons.at(-1)).toBe("stale or missing quote");
});
it.each([
  { takerFeeBps: -1 },
  { takerFeeBps: 1.5 },
  { takerFeeBps: 10_001 },
  { minNetEdgeCents: -1 },
  { minNetEdgeCents: Infinity },
  { maxKellyFraction: 0 },
  { maxKellyFraction: 1.1 },
  { maxQuoteAgeMs: -5 },
])("rejects invalid forecast limit %j", (bad) =>
  expect(gate(10000, approval().proposal, { ...limits, ...bad }).reasons).toContain(
    "invalid risk limits",
  ),
);
