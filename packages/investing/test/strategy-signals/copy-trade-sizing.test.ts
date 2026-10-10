import { expect, it } from "vitest";
import {
  evaluateCopyTradeSizing,
  normalizeCopyTradeConfig,
} from "../../src/prediction-markets/strategies/copy-trade-sizing";
import { copyTradeSizingSource } from "../../src/strategy-signals/sources/copy-trade-sizing";
import type { CopyTradeSizingInput } from "../../src/strategy-signals/sources/copy-trade-sizing";
import { runEventDemo, syntheticMarket } from "../../src/strategy-signals/demo";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import fixture from "../../src/strategy-signals/fixtures/copy-trade-sizing/percentage.json";
import golden from "./golden/copy-trade-sizing-rust.json";

const input = fixture as CopyTradeSizingInput,
  time = input.asOf;
it("matches the original Rust percentage, fixed, cap and tiny-whale tests", () => {
  expect(evaluateCopyTradeSizing(input)).toEqual(golden.percentage);
  expect(evaluateCopyTradeSizing(input, { strategy: "FIXED" })).toEqual(golden.fixed);
  expect(
    evaluateCopyTradeSizing({ ...input, notionalUsd: 10000, shares: 20000 }, { copySize: 100 }),
  ).toEqual(golden.cap);
  expect(evaluateCopyTradeSizing({ ...input, shares: 1 })).toEqual(golden.tinyWhale);
});
it("matches hand-reviewed adaptive curve numbers and threshold-zero floor", () => {
  const small = evaluateCopyTradeSizing(input, { strategy: "ADAPTIVE" });
  const big = evaluateCopyTradeSizing({ ...input, notionalUsd: 10000 }, { strategy: "ADAPTIVE" });
  expect(small.effectivePercent).toBeCloseTo(golden.adaptiveSmallPercent, 12);
  expect(big.effectivePercent).toBeCloseTo(golden.adaptiveLargePercent, 12);
  expect(small.effectivePercent).toBeGreaterThan(big.effectivePercent);
  expect(
    evaluateCopyTradeSizing(input, { strategy: "ADAPTIVE", adaptiveThresholdUsd: 0 })
      .effectivePercent,
  ).toBe(5);
});
it("applies multiplier, minimum notional and floor-contract boundaries without forcing one", () => {
  expect(evaluateCopyTradeSizing(input, { tradeMultiplier: 0.5 }).copyUsd).toBe(10);
  expect(
    evaluateCopyTradeSizing({ ...input, shares: 10 }, { copySize: 5 }).skipped,
  ).toBeUndefined();
  expect(evaluateCopyTradeSizing(input, { copySize: 4.9999 }).skipped).toBe("BelowMinOrderSize");
  expect(
    evaluateCopyTradeSizing(input, { strategy: "FIXED", copySize: 0.499, minOrderSizeUsd: 0 })
      .skipped,
  ).toBe("BelowOneContract");
  expect(
    evaluateCopyTradeSizing(input, { strategy: "FIXED", copySize: 0.5, minOrderSizeUsd: 0 })
      .quantity,
  ).toBe(1);
  expect(
    evaluateCopyTradeSizing(input, { strategy: "FIXED", copySize: 0.9999, minOrderSizeUsd: 0 })
      .quantity,
  ).toBe(1);
  expect(
    evaluateCopyTradeSizing(input, { strategy: "FIXED", copySize: 1, minOrderSizeUsd: 0 }).quantity,
  ).toBe(2);
  expect(evaluateCopyTradeSizing({ ...input, notionalUsd: 0 }).skipped).toBe("NonPositiveNotional");
});
it("BUY then observed SELL flows through the agent chain using real holdings", async () => {
  const m = syntheticMarket(input.marketId, 50, input.venue),
    venue = new MockVenue(input.venue, [m]);
  const first = copyTradeSizingSource.run(input, {
    account: venue.snapshot(),
    evaluationTime: time,
  });
  expect(first[0].order?.quantity).toBe(golden.percentage.quantity);
  expect(first[0].probability).toBeUndefined();
  const buy = await runEventDemo(first, copyTradeSizingSource, venue, m, time);
  expect(buy.fill?.status).toBe("FILLED");
  expect(buy.after.kind === "event" && buy.after.portfolio.cashCents).toBe(8000);
  const exit = copyTradeSizingSource.run(
    { ...input, side: "SELL" },
    { account: venue.snapshot(), evaluationTime: time },
  );
  const sell = await runEventDemo(exit, copyTradeSizingSource, venue, m, time);
  expect(sell.fill?.status).toBe("FILLED");
  expect(sell.after.kind === "event" && sell.after.portfolio.cashCents).toBe(10000);
});
it.each([
  null,
  {},
  { ...input, side: "SHORT" },
  { ...input, outcome: "MAYBE" },
  { ...input, shares: NaN },
  { ...input, config: { tradeMultiplier: -1 } },
  { ...input, config: { strategy: "OTHER" } },
  { ...input, asOf: "2026-01-01T00:00:11Z" },
])("rejects malformed source input %#", (value) => {
  expect(() => copyTradeSizingSource.run(value as any, { evaluationTime: time })).toThrow();
});
it("rejects unsafe contract counts and invalid sizing configurations", () => {
  expect(() =>
    evaluateCopyTradeSizing(input, { strategy: "FIXED", copySize: 1e20, maxOrderSizeUsd: 1e20 }),
  ).toThrow("safe integer");
  expect(() => normalizeCopyTradeConfig({ minOrderSizeUsd: 1000, maxOrderSizeUsd: 500 })).toThrow();
  expect(() => normalizeCopyTradeConfig({ adaptiveMinPercent: 31 })).toThrow();
});
