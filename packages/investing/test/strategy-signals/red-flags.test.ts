import { describe, expect, it } from "vitest";
import { redFlagsSource } from "../../src/strategy-signals/sources/red-flags";
import { renderStrategySignalsReport } from "../../src/strategy-signals/report";
import { applyRiskGate } from "../../src/strategy-signals/risk-gate";
import golden from "./golden/red-flags-extreme.json";
const context = { evaluationTime: "2026-06-10T00:00:00Z" };
const run = (metrics: Record<string, unknown>) =>
  redFlagsSource.run({ symbol: "FIXTURE", ...metrics }, context)[0]!;

describe("independent advisory red flags", () => {
  it("matches the native detector reference flags under the approved advisory policy", () => {
    const signal = redFlagsSource.run(golden.input, context)[0]!;
    expect(String(signal.evidence?.flags).split(",").sort()).toEqual(golden.expectedFlags);
    expect(signal.action).toBe(golden.integrationAction);
    expect(signal.kind).toBe(golden.kind);
  });
  it.each([
    [{ debtToEquityPercent: 501 }, "EXTREME_LEVERAGE"],
    [{ netIncome: 100, freeCashFlow: -201 }, "EARNINGS_QUALITY"],
    [{ interestCoverage: 1.99, debtToEquityPercent: 101 }, "REFINANCING_RISK"],
  ])("evaluates each rule", (input, flag) => expect(run(input).reasoning).toContain(flag));
  it.each([
    { debtToEquityPercent: 500 },
    { netIncome: 100, freeCashFlow: -200 },
    { interestCoverage: 2, debtToEquityPercent: 101 },
    { interestCoverage: 1, debtToEquityPercent: 100 },
  ])("keeps strict equality boundaries", (input) => expect(run(input).evidence?.flagCount).toBe(0));
  it("applies sector-specific thresholds and banking exemption", () => {
    expect(
      run({ sector: "utilities", debtToEquityPercent: 800, interestCoverage: 1.5 }).evidence
        ?.flagCount,
    ).toBe(0);
    expect(
      run({ sector: "shipping", debtToEquityPercent: 801, interestCoverage: 1.49 }).evidence
        ?.flagCount,
    ).toBe(2);
    expect(
      run({ sector: "banking", debtToEquityPercent: 2000, interestCoverage: 0.1 }).evidence
        ?.flagCount,
    ).toBe(0);
    expect(run({ sector: "banking", netIncome: 100, freeCashFlow: -300 }).evidence?.flagCount).toBe(
      1,
    );
  });
  it("appears in the report and never acts as a gate veto", () => {
    const signal = run({
      debtToEquityPercent: 600,
      netIncome: 100,
      freeCashFlow: -250,
      interestCoverage: 1.5,
    });
    expect(signal.action).toBe("HOLD");
    expect(signal.kind).toBe("recommendation");
    expect(renderStrategySignalsReport([signal], [])).toContain("EXTREME_LEVERAGE");
    const instrument = signal.instrument,
      proposal = {
        proposalId: "p",
        sourceId: signal.sourceId,
        instrument,
        action: "BUY" as const,
        quantity: 2,
        limitPriceCents: 100,
        asOf: context.evaluationTime,
      };
    expect(
      applyRiskGate(
        proposal,
        { ...context, instrument, account: { kind: "equity", cashCents: 10000, shares: {} } },
        { maxPositionPerMarket: 10 },
        { label: "SURVIVAL", sizeMultiplier: 1, allowNewEntries: true },
        redFlagsSource,
        signal,
      ).allowed,
    ).toBe(true);
    expect(redFlagsSource.guards).toBeUndefined();
  });
  it("treats missing metrics as unknown rather than healthy and rejects non-finite inputs", () => {
    expect(run({}).reasoning).toContain("Missing metrics");
    expect(() => run({ netIncome: NaN })).toThrow();
    expect(() => run({ sector: "mystery" })).toThrow();
    expect(() => redFlagsSource.run(null as never, context)).toThrow();
  });
});
