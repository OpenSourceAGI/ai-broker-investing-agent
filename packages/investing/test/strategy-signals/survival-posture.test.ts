import { describe, expect, it } from "vitest";
import {
  initialSurvivalState,
  updateSurvivalState,
  toSurvivalPosture,
} from "../../src/strategy-signals/survival-posture";
import { applyRiskGate } from "../../src/strategy-signals/risk-gate";
import golden from "./golden/survival-posture-sequence.json";

describe("survival state and approved demo posture", () => {
  it("matches the actual native reference sequence with immediate Critical", () => {
    let state = initialSurvivalState();
    const modes = golden.balances.map((balance) => {
      state = updateSurvivalState(state, balance, golden.initialBalance);
      return state.mode;
    });
    expect(modes).toEqual(golden.states);
  });
  it("requires the third consecutive tick and resets interrupted changes", () => {
    let s = initialSurvivalState();
    s = updateSurvivalState(s, 1200, 1000);
    expect(s.pendingCount).toBe(1);
    s = updateSurvivalState(s, 1199, 1000);
    expect(s.pending).toBeNull();
    s = updateSurvivalState(s, 1200, 1000);
    s = updateSurvivalState(s, 1200, 1000);
    expect(s.mode).toBe("SURVIVAL");
    expect(updateSurvivalState(s, 1200, 1000).mode).toBe("GROWTH");
  });
  it("enters Critical immediately, then applies hysteresis to recovery", () => {
    let s = updateSurvivalState(initialSurvivalState(), 500, 1000);
    expect(s.mode).toBe("CRITICAL");
    s = updateSurvivalState(s, 600, 1000);
    s = updateSurvivalState(s, 600, 1000);
    expect(s.mode).toBe("CRITICAL");
    expect(updateSurvivalState(s, 600, 1000).mode).toBe("DEFENSIVE");
  });
  it.each([
    ["GROWTH", 1],
    ["SURVIVAL", 1],
    ["RECOVERY", 0.75],
    ["DEFENSIVE", 0.5],
    ["CRITICAL", 0],
  ] as const)("pins new demo %s multiplier", (mode, multiplier) => {
    expect(toSurvivalPosture(mode)).toEqual({
      label: mode,
      sizeMultiplier: multiplier,
      allowNewEntries: mode !== "CRITICAL",
    });
  });
  it("Critical blocks entries while exits are permitted from actual holdings", () => {
    const instrument = { type: "equity" as const, symbol: "FIXTURE" },
      asOf = "2026-06-10T00:00:00Z";
    const context = {
      instrument,
      evaluationTime: asOf,
      account: {
        kind: "equity" as const,
        cashCents: 10000,
        shares: { FIXTURE: { quantity: 3, averagePriceCents: 100 } },
      },
    };
    const proposal = {
      proposalId: "p",
      sourceId: "s",
      instrument,
      action: "BUY" as const,
      asOf,
      quantity: 3,
      limitPriceCents: 100,
    };
    expect(
      applyRiskGate(proposal, context, { maxPositionPerMarket: 10 }, toSurvivalPosture("CRITICAL"))
        .allowed,
    ).toBe(false);
    expect(
      applyRiskGate(
        { ...proposal, action: "SELL" },
        context,
        { maxPositionPerMarket: 10 },
        toSurvivalPosture("CRITICAL"),
      ).maxQuantity,
    ).toBe(3);
  });
  it.each([
    [0, 100],
    [100, 0],
    [-1, 100],
    [Infinity, 100],
    [NaN, 100],
  ])("rejects malformed equity %s/%s", (current, initial) => {
    if (current === 0 && initial > 0)
      expect(updateSurvivalState(initialSurvivalState(), current, initial).mode).toBe("CRITICAL");
    else expect(() => updateSurvivalState(initialSurvivalState(), current, initial)).toThrow();
  });
});
