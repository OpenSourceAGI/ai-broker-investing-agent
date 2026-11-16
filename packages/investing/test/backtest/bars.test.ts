import { describe, it, expect } from "vitest";
import { normalizeBars } from "../../src/backtest/bars";
import { FIXTURE_SYMBOLS, loadFixtureBars } from "../../src/backtest/fixtures";

describe("normalizeBars", () => {
  it("drops bars with null or non-finite prices", () => {
    const bars = normalizeBars([
      { date: "2024-01-02", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { date: "2024-01-03", open: null, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { date: "2024-01-04", open: 1, high: 2, low: 0.5, close: Number.NaN, volume: 10 },
    ]);
    expect(bars.map((b) => b.date)).toEqual(["2024-01-02"]);
  });

  it("accepts Date objects, sorts ascending, keeps the last duplicate and zero-fills volume", () => {
    const bars = normalizeBars([
      { date: new Date("2024-01-05T14:30:00Z"), open: 3, high: 3, low: 3, close: 3, volume: null },
      { date: "2024-01-04", open: 1, high: 1, low: 1, close: 1, volume: 5 },
      { date: "2024-01-04T00:00:00.000Z", open: 2, high: 2, low: 2, close: 2, volume: 6 },
    ]);
    expect(bars).toEqual([
      { date: "2024-01-04", open: 2, high: 2, low: 2, close: 2, volume: 6 },
      { date: "2024-01-05", open: 3, high: 3, low: 3, close: 3, volume: 0 },
    ]);
  });

  it("ignores rows without a valid date", () => {
    expect(normalizeBars([{ date: "not a date", open: 1, high: 1, low: 1, close: 1 }, null, 42])).toEqual([]);
  });
});

describe("demo fixtures", () => {
  it("covers AAPL, MSFT and SPY", () => {
    expect(FIXTURE_SYMBOLS).toEqual(["AAPL", "MSFT", "SPY"]);
  });

  it("AAPL 2023 has more than 240 sorted, finite bars", () => {
    const bars = loadFixtureBars("aapl", "2023-01-01", "2023-12-31");
    expect(bars).not.toBeNull();
    expect(bars!.length).toBeGreaterThan(240);
    expect(bars![0].date >= "2023-01-01" && bars!.at(-1)!.date <= "2023-12-31").toBe(true);
    expect(bars!.every((b, i) => i === 0 || b.date > bars![i - 1].date)).toBe(true);
    expect(bars!.every((b) => [b.open, b.high, b.low, b.close].every(Number.isFinite))).toBe(true);
  });

  it("an unknown symbol returns null", () => {
    expect(loadFixtureBars("TSLA", "2023-01-01", "2023-12-31")).toBeNull();
  });
});
