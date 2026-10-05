import { it, expect } from "vitest";
import { kalshiMomentumSource as source } from "../../src/strategy-signals/sources/kalshi-momentum";
import { MockVenue } from "../../src/strategy-signals/venues/mock-venue";
import { approval, market, time } from "./helpers";
import entryGolden from "./golden/kalshi-momentum-entry.json";

const ticks = (prices: number[]) =>
  prices.map((yesPriceCents, i) => ({
    ticker: "FIXTURE",
    yesPriceCents,
    timestamp: `2026-01-01T00:00:0${i}Z`,
  }));
it("fresh latest entry uses 55 cents, not an earlier replay fill", () => {
  const s = source.run({ ticks: ticks([50, 51, 52, 53, 55]) }, { evaluationTime: time })[0];
  expect(s.order).toMatchObject(entryGolden);
  expect(s.probability).toBeUndefined();
});
it("actual holdings suppress reentry and allow a real exit", async () => {
  const v = new MockVenue("kalshi", [market]);
  await v.execute(approval());
  expect(
    source.run(
      { ticks: ticks([48, 49, 50, 51, 52]) },
      { account: v.snapshot(), evaluationTime: time },
    )[0].action,
  ).toBe("HOLD");
  expect(
    source.run(
      { ticks: ticks([50, 51, 52, 53, 55]) },
      { account: v.snapshot(), evaluationTime: time },
    )[0].action,
  ).toBe("SELL");
});
it("flat and empty inputs hold; mixed and duplicate inputs reject", () => {
  expect(source.run({ ticks: ticks([50, 50, 50, 50]) }, { evaluationTime: time })[0].action).toBe(
    "HOLD",
  );
  expect(source.run({ ticks: [] }, { evaluationTime: time })[0].reasoning).toBe("no ticks");
  expect(() =>
    source.run(
      { ticks: [...ticks([50]), { ...ticks([51])[0], ticker: "other" }] },
      { evaluationTime: time },
    ),
  ).toThrow();
  expect(() =>
    source.run({ ticks: [...ticks([50]), ...ticks([51])] }, { evaluationTime: time }),
  ).toThrow();
});
