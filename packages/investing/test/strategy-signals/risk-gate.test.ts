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
