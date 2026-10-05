import { describe, expect, it } from "vitest";
import reference from "./golden/hedge-fund-technicals-reference.json";
import {
  analyzeTechnicals,
  combineTechnicalSignals,
  hedgeFundTechnicalsSource,
  technicalRsi,
  technicalEma,
  technicalAdx,
  technicalAtr,
  technicalBollinger,
  technicalHurst,
  type TechnicalGroups,
} from "../../src/strategy-signals/sources/hedge-fund-technicals";
import { openBBTrendRows } from "../../src/strategy-signals/fixtures/openbb-data/bars";
import { validateSignal } from "../../src/strategy-signals/validate";

const context = { evaluationTime: "2026-06-10T00:00:00Z" };
function near(actual: number, expected: number | null) {
  if (expected === null) expect(Number.isFinite(actual)).toBe(false);
  else expect(actual).toBeCloseTo(expected, 7);
}

describe("five-group technicals against the actual Python run", () => {
  for (const fixture of reference.cases) {
    it(`matches every group, confidence and metric for ${fixture.name}`, () => {
      const analysis = analyzeTechnicals(fixture.bars);
      for (const name of Object.keys(analysis.groups) as Array<keyof TechnicalGroups>) {
        const actual = analysis.groups[name],
          expected = fixture.groups[name];
        expect(actual.signal).toBe(expected.signal);
        near(actual.confidence, expected.confidence);
        for (const [key, value] of Object.entries(expected.metrics))
          near(actual.metrics[key]!, value);
      }
      expect(analysis.combined.signal).toBe(fixture.combined.signal);
      near(analysis.combined.confidence, fixture.combined.confidence);
      const signal = hedgeFundTechnicalsSource.run(
        { symbol: "FIXTURE", bars: fixture.bars },
        context,
      )[0]!;
      expect(validateSignal(signal)).toEqual([]);
    });
    it(`matches numeric helpers for ${fixture.name}`, () => {
      const close = fixture.bars.map((b) => b.close),
        bb = technicalBollinger(close);
      const values = {
        rsi14: technicalRsi(close).at(-1)!,
        ema8: technicalEma(close, 8).at(-1)!,
        bbUpper: bb.upper.at(-1)!,
        bbLower: bb.lower.at(-1)!,
        atr14: technicalAtr(fixture.bars).at(-1)!,
        adx14: technicalAdx(fixture.bars).at(-1)!,
        hurst: technicalHurst(close),
      };
      for (const key of Object.keys(values) as Array<keyof typeof values>)
        near(values[key], fixture.helpers[key]);
    });
  }
  it("uses strict score boundaries at +0.2 and -0.2", () => {
    // Five equal weighted confidences: trend and momentum have 25% weight each.
    // With all confidences 1, mean_reversion alone gives precisely +/-0.2.
    const groups = Object.fromEntries(
      ["trend", "mean_reversion", "momentum", "volatility", "stat_arb"].map((name) => [
        name,
        { signal: "neutral", confidence: 1, metrics: {} },
      ]),
    ) as TechnicalGroups;
    groups.mean_reversion.signal = "bullish";
    expect(combineTechnicalSignals(groups).signal).toBe("neutral");
    groups.mean_reversion.signal = "bearish";
    expect(combineTechnicalSignals(groups).signal).toBe("neutral");
    groups.trend.signal = "bearish";
    expect(combineTechnicalSignals(groups).signal).toBe("bearish");
  });
  it("preserves RSI rolling rather than Wilder means and sample Bollinger variance", () => {
    near(technicalRsi([10, 11, 9, 12], 3).at(-1)!, 100 - 100 / (1 + 4 / 2));
    near(technicalBollinger([1, 2, 3], 3).upper.at(-1)!, 4);
    near(technicalEma([10, 20], 3).at(-1)!, 15);
  });
  it("provides executable directional stock samples without a fake probability", () => {
    for (const direction of ["up", "down"] as const) {
      const signal = hedgeFundTechnicalsSource.run(
        { symbol: "FIXTURE", bars: openBBTrendRows(direction), quantity: 2 },
        context,
      )[0]!;
      expect(signal.action).toBe(direction === "up" ? "BUY" : "SELL");
      expect(signal.probability).toBeUndefined();
      expect(Number.isInteger(signal.sizing?.limitPriceCents)).toBe(true);
    }
  });
  it("handles empty, flat and zero-volume series, and refuses missing volume", () => {
    expect(hedgeFundTechnicalsSource.run({ symbol: "FIXTURE", bars: [] }, context)[0]?.action).toBe(
      "HOLD",
    );
    expect(
      hedgeFundTechnicalsSource.run(
        { symbol: "FIXTURE", bars: reference.cases.find((c) => c.name === "flat")!.bars },
        context,
      )[0]?.action,
    ).toBe("HOLD");
    const input = { symbol: "FIXTURE", bars: openBBTrendRows("up") };
    expect(
      hedgeFundTechnicalsSource.run({ ...input, missingVolume: 1 }, context)[0]?.reasoning,
    ).toContain("refused");
    expect(
      hedgeFundTechnicalsSource.run(
        { ...input, bars: input.bars.map((b) => ({ ...b, volume: 0 })) },
        context,
      )[0]?.confidence,
    ).toBeGreaterThanOrEqual(0);
  });
  it("rejects malformed, future, duplicate, unordered and non-finite bars", () => {
    const bars = openBBTrendRows("up");
    for (const bad of [
      [bars[1]!, bars[0]!],
      [bars[0]!, bars[0]!],
      [{ ...bars[0]!, close: NaN }],
      [{ ...bars[0]!, date: "2027-01-01" }],
    ])
      expect(() =>
        hedgeFundTechnicalsSource.run({ symbol: "FIXTURE", bars: bad }, context),
      ).toThrow();
    expect(() => hedgeFundTechnicalsSource.run(null as never, context)).toThrow();
  });
});
