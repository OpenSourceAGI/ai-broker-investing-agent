import { it, expect } from "vitest";
import {
  partitionValidSignals,
  validateSignal,
  validateLimits,
  validatePosture,
  validateAccount,
} from "../../src/strategy-signals/validate";
import { signal, time } from "./helpers";

it.each([
  null,
  [],
  {},
  signal({ kind: "bad" as never }),
  signal({ action: "BAD" as never }),
  signal({ confidence: NaN }),
  signal({ probability: Infinity }),
  signal({ sourceId: " spaced " }),
  signal({ asOf: "yesterday" }),
  signal({ sizing: { quantity: Number.MAX_SAFE_INTEGER + 1 } }),
  signal({ action: "HOLD", sizing: { quantity: 1 } }),
  signal({ kind: "portfolio", targets: [] }),
  signal({
    kind: "portfolio",
    targets: [
      { ticker: "FIXTURE", outcome: "YES", quantity: 1, priceCents: 50 },
      { ticker: "FIXTURE", outcome: "YES", quantity: 2, priceCents: 50 },
    ],
  }),
])("rejects malformed input %#", (value) =>
  expect(validateSignal(value).length).toBeGreaterThan(0),
);
it("validates nested identity before selection", () =>
  expect(
    validateSignal(
      signal({
        kind: "order",
        order: {
          action: "BUY",
          ticker: "OTHER",
          outcome: "NO",
          quantity: 1,
          priceCents: 50,
          timestamp: time,
          reason: "fixture",
        },
      }),
    ).length,
  ).toBeGreaterThan(0));
it("preserves decimal strategy prices and zero quantities", () =>
  expect(validateSignal(signal({ sizing: { quantity: 0, limitPriceCents: 49.9 } }))).toEqual([]));
it("rejects future and stale signals", () => {
  expect(
    partitionValidSignals([signal({ asOf: "2026-01-01T00:00:11Z" })], signal().instrument, time)
      .valid,
  ).toEqual([]);
  expect(
    partitionValidSignals([signal({ asOf: "2026-01-01T00:00:00Z" })], signal().instrument, time, {
      id: "fixture",
      maxSignalAgeMs: 9999,
    }).valid,
  ).toEqual([]);
});
it("rejects configuration shapes", () => {
  expect(validateLimits({ maxPositionPerMarket: -1 })).not.toEqual([]);
  expect(validatePosture({ label: "bad", sizeMultiplier: 1.1, allowNewEntries: true })).not.toEqual(
    [],
  );
  expect(validateAccount(null)).not.toEqual([]);
  expect(validateAccount({ kind: "equity", cashCents: Infinity, shares: {} })).not.toEqual([]);
});
