import { expect, it } from "vitest";
import reference from "./golden/hedge-fund-technicals-reference.json";
import { hedgeFundTechnicalsSource } from "../../src/strategy-signals/sources/hedge-fund-technicals";
import { DAILY_REPLAY_WARMUP_BARS, replayDailyActions } from "../../src/strategy-signals/replay";
import type { StockData } from "../../src/trading-agents/types";

const bars = (name: string) =>
  reference.cases.find((c) => c.name === name)!.bars as unknown as StockData[];
const expected = { bullish: 1, bearish: -1, neutral: 0 } as const;

// The last decision sees the whole 160-bar series, so it must equal the Python reference.
it.each(["up", "down", "flat", "oscillating"])("%s replay ends on the Python reference signal", (name) => {
  const fixture = reference.cases.find((c) => c.name === name)!;
  const actions = replayDailyActions(hedgeFundTechnicalsSource, "FIXTURE", bars(name));
  expect(actions).toHaveLength(160);
  expect(actions.at(-1)).toBe(expected[fixture.combined.signal as keyof typeof expected]);
});

it("holds through warmup, including series shorter than the longest lookback", () => {
  const actions = replayDailyActions(hedgeFundTechnicalsSource, "FIXTURE", bars("up"));
  expect(actions.slice(0, DAILY_REPLAY_WARMUP_BARS - 1).every((a) => a === 0)).toBe(true);
  // Upstream still emits bearish on 8 bars; the replay deliberately refuses to trade that early.
  expect(replayDailyActions(hedgeFundTechnicalsSource, "FIXTURE", bars("short"))).toEqual(
    Array(8).fill(0),
  );
});

it("never looks ahead: each decision is unchanged when later bars change or vanish", () => {
  const series = bars("oscillating");
  const full = replayDailyActions(hedgeFundTechnicalsSource, "FIXTURE", series);
  const shocked = series.map((bar, i) =>
    i > 140 ? { ...bar, open: bar.open * 3, high: bar.high * 3, low: bar.low * 3, close: bar.close * 3 } : bar,
  );
  const changed = replayDailyActions(hedgeFundTechnicalsSource, "FIXTURE", shocked);
  expect(changed.slice(0, 141)).toEqual(full.slice(0, 141));
  for (const k of [126, 135, 150])
    expect(replayDailyActions(hedgeFundTechnicalsSource, "FIXTURE", series.slice(0, k + 1)).at(-1)).toBe(full[k]);
});

it.each([
  ["after warmup", 130],
  ["inside warmup", 5],
])("surfaces an invalid bar %s instead of skipping it", (_label, index) => {
  const series = bars("up").map((bar, i) => (i === index ? { ...bar, close: -1 } : bar));
  expect(() => replayDailyActions(hedgeFundTechnicalsSource, "FIXTURE", series)).toThrow(
    "invalid technicals close",
  );
  // An early bad bar must not be hidden by the trailing window either.
  expect(() =>
    replayDailyActions(hedgeFundTechnicalsSource, "FIXTURE", series, 20, 1),
  ).toThrow("invalid technicals close");
});
